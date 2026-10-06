import json
import logging
import os
import time

import pika
import psycopg

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("jupiter.outbox")
DATABASE_URL = os.environ["DATABASE_URL"]
AMQP_URL = os.environ["AMQP_URL"]
EXCHANGE = "jupiter.events"
EVENT_TYPES = ("vehicle.booked", "sale.completed", "inventory.updated")


def claim_next(connection: psycopg.Connection):
    with connection.transaction():
        return connection.execute(
            """WITH candidate AS (
                 SELECT id FROM event_outbox
                 WHERE published_at IS NULL AND next_attempt_at <= now()
                 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
               )
               UPDATE event_outbox AS events
               SET attempts = attempts + 1, next_attempt_at = now() + interval '30 seconds'
               FROM candidate WHERE events.id = candidate.id
               RETURNING events.id, events.event_type, events.aggregate_id, events.payload, events.attempts"""
        ).fetchone()


def publish(event) -> None:
    event_id, event_type, aggregate_id, payload, _attempts = event
    params = pika.URLParameters(AMQP_URL)
    params.heartbeat = 30
    params.blocked_connection_timeout = 10
    connection = pika.BlockingConnection(params)
    try:
        channel = connection.channel()
        channel.exchange_declare(exchange=EXCHANGE, exchange_type="topic", durable=True)
        for event_type in EVENT_TYPES:
            queue = f"jupiter.{event_type}"
            channel.queue_declare(
                queue=queue,
                durable=True,
                arguments={"x-max-length": 100000, "x-message-ttl": 604800000, "x-overflow": "reject-publish"},
            )
            channel.queue_bind(exchange=EXCHANGE, queue=queue, routing_key=event_type)
        channel.confirm_delivery()
        body = json.dumps({"id": event_id, "type": event_type, "aggregateId": str(aggregate_id), "payload": payload}, separators=(",", ":"))
        accepted = channel.basic_publish(
            exchange=EXCHANGE,
            routing_key=event_type,
            body=body,
            properties=pika.BasicProperties(
                content_type="application/json",
                delivery_mode=pika.DeliveryMode.Persistent,
                message_id=str(event_id),
                type=event_type,
            ),
            mandatory=True,
        )
        if accepted is False:
            raise RuntimeError("broker did not confirm event")
    finally:
        if connection.is_open:
            connection.close()


def mark_published(connection: psycopg.Connection, event_id: int) -> None:
    with connection.transaction():
        connection.execute("UPDATE event_outbox SET published_at = now(), last_error = NULL WHERE id = %s", (event_id,))


def mark_failed(connection: psycopg.Connection, event_id: int, attempts: int, error: Exception) -> None:
    delay_seconds = min(3600, 5 * (2 ** min(attempts, 10)))
    with connection.transaction():
        connection.execute(
            """UPDATE event_outbox SET last_error = %s,
               next_attempt_at = now() + make_interval(secs => %s) WHERE id = %s""",
            (str(error)[:1000], delay_seconds, event_id),
        )


def run() -> None:
    while True:
        try:
            with psycopg.connect(DATABASE_URL) as connection:
                event = claim_next(connection)
                if event is None:
                    time.sleep(1)
                    continue
                try:
                    publish(event)
                    mark_published(connection, event[0])
                    logger.info("published outbox event id=%s type=%s", event[0], event[1])
                except Exception as error:
                    mark_failed(connection, event[0], event[4], error)
                    logger.warning("event publish failed id=%s: %s", event[0], error)
        except psycopg.Error as error:
            logger.error("outbox database unavailable: %s", error)
            time.sleep(3)


if __name__ == "__main__":
    run()