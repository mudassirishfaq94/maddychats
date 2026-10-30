# Superseded encryption review

The earlier text at this path contained unsupported implementation claims, including references to a nonexistent hardware-storage module and placeholder checks described as security evidence. Those conclusions and numeric ratings are withdrawn. Git history preserves the original record; it must not be used to approve a release or describe the current product.

For the active code paths, read [Current encryption coverage](docs/security/encryption-current.md). For confirmed findings and remediation evidence, use the current review tracker when available. Internal tests are not an independent cryptographic audit.

Private chat content is encrypted on the client. This does not establish Signal protocol compatibility, forward secrecy, authenticated key distribution, or protection against an actively malicious server delivering modified client code. Those are separate protocol and client-delivery requirements.
