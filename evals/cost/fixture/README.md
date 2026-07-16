# Authentication Service Fixture

This disposable service demonstrates layered configuration and token-based sessions.

Configuration precedence is project settings over user settings over defaults. Invalid configuration must be rejected before the service starts. Authentication events currently have no durable audit sink.
