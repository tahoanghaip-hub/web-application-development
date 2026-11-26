import hashlib


def password_key(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**15, r=8, p=1,
                          maxmem=64 * 1024 * 1024).hex()
