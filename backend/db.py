from sqlalchemy import create_engine, text
from config import config
from contextlib import contextmanager

params = config()
print(f"postgresql://{params['user']}:{params['password']}@{params['host']}:{params['port']}/{params['database']}")
engine = create_engine(f"postgresql://{params['user']}:{params['password']}@{params['host']}:{params['port']}/{params['database']}",
                       pool_size=5,
                       max_overflow=10,
                       pool_timeout=30,
                       pool_recycle=1800)

@contextmanager
def connect():
    conn = None
    try:
        conn = engine.connect()
        yield conn
    except:
        print("Connection failed")
        raise
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    try:
        with connect() as conn:
            result = conn.execute(text("select version();"))
            for row in result:
                print(row)
    except:
        print("Test failed")