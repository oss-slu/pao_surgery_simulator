from sqlalchemy import create_engine
from config import config
from sqlalchemy.orm import sessionmaker, declarative_base
from contextlib import contextmanager

params = config()
engine = create_engine(f"postgresql://{params['user']}:{params['password']}@{params['host']}:{params['port']}/{params['database']}",
                       pool_size=5,
                       max_overflow=10,
                       pool_timeout=30,
                       pool_recycle=1800)

Session = sessionmaker(autoflush=False, bind=engine)
Base = declarative_base()

@contextmanager
def connect():
    db = Session()
    try:
        yield db
        db.commit()
    except:
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == '__main__':
    try:
        with engine.connect() as conn:
            result = conn.execute("select version();")
            for row in result:
                print(row)
    except:
        print("Test failed")