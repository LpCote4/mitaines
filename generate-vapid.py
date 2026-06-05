"""Generate VAPID key pair for web push notifications."""
import base64
import hashlib
import sys

try:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
except ImportError:
    sys.exit("Run: pip install cryptography")

key = ec.generate_private_key(ec.SECP256R1())

private_pem = key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.TraditionalOpenSSL,
    encryption_algorithm=serialization.NoEncryption(),
).decode().strip()

pub_bytes = key.public_key().public_bytes(
    encoding=serialization.Encoding.X962,
    format=serialization.PublicFormat.UncompressedPoint,
)
public_b64 = base64.urlsafe_b64encode(pub_bytes).rstrip(b"=").decode()

print("\n# Copie ces lignes dans ton .env :\n")
print(f"VAPID_PUBLIC_KEY={public_b64}")
print(f'VAPID_PRIVATE_KEY="{private_pem}"')
print()
