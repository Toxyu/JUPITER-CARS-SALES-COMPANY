FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/inventory ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/inventory /inventory
EXPOSE 8080
ENTRYPOINT ["/inventory"]