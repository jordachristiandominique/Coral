"""Provision a fresh local database after installing PostgreSQL on Windows.

Requires backups/postgresql-local-admin.json, created during installation.
Refuses to overwrite existing roles, databases, or .env files.
"""
import json
from pathlib import Path
import secrets

import psycopg
from psycopg import sql


def main():
    root = Path(__file__).resolve().parent.parent
    env_path = root / '.env'
    if env_path.exists():
        raise SystemExit('.env already exists; review it before provisioning.')
    admin = json.loads((root / 'backups/postgresql-local-admin.json').read_text(encoding='utf-8-sig'))
    app_password, test_password = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    with psycopg.connect(dbname='postgres', user=admin['username'], password=admin['password'],
                         host=admin['host'], port=admin['port'], connect_timeout=5, autocommit=True) as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pg_database WHERE datname='coralsense_local'")
            if cursor.fetchone():
                raise SystemExit('coralsense_local already exists; refusing to replace it.')
            cursor.execute("SELECT 1 FROM pg_roles WHERE rolname IN ('coralsense_app', 'coralsense_test')")
            if cursor.fetchone():
                raise SystemExit('A project role already exists; refusing to replace its credentials.')
            cursor.execute(sql.SQL('CREATE ROLE coralsense_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD {}').format(sql.Literal(app_password)))
            cursor.execute(sql.SQL('CREATE ROLE coralsense_test LOGIN NOSUPERUSER CREATEDB NOCREATEROLE PASSWORD {}').format(sql.Literal(test_password)))
            cursor.execute("CREATE DATABASE coralsense_local OWNER coralsense_app ENCODING 'UTF8' TEMPLATE template0")
            cursor.execute('SHOW listen_addresses')
            addresses = cursor.fetchone()[0]
            if addresses not in ('localhost', '127.0.0.1', '::1', '127.0.0.1,::1'):
                cursor.execute("ALTER SYSTEM SET listen_addresses='localhost'")
                print('Restricted PostgreSQL to localhost; restart the PostgreSQL service before continuing.')
    env_path.write_text(
        '# Generated local credentials. Keep this file out of Git.\n'
        '# SQLite stays active until the PostgreSQL transfer is verified.\n'
        'DB_ENGINE=sqlite\nDB_NAME=coralsense_local\nDB_USER=coralsense_app\n'
        f'DB_PASSWORD={app_password}\nDB_HOST=127.0.0.1\nDB_PORT=5432\nDB_SSLMODE=prefer\n',
        encoding='utf-8',
    )
    (root / 'backups/postgresql-local-test.json').write_text(
        json.dumps({'user': 'coralsense_test', 'password': test_password}), encoding='utf-8')
    print('Created coralsense_local, application role, and separate local test role. SQLite remains active.')


if __name__ == '__main__':
    main()
