import sys
from getpass import getpass

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from .database import engine
from .main import Credentials, create_user


def main():
    username = input("Tên Admin mới: ")
    password = getpass("Mật khẩu (ít nhất 8 ký tự): ") if sys.stdin.isatty() else input()
    try:
        data = Credentials(username=username, password=password)
        with Session(engine) as db:
            create_user(db, data, "Admin")
    except ValidationError:
        sys.exit("Tên đăng nhập cần 3–64 ký tự và mật khẩu cần 8–256 ký tự.")
    except HTTPException as error:
        sys.exit(error.detail)
    print("Đã tạo Admin.")


if __name__ == "__main__":
    main()
