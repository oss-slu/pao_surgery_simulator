from sqlalchemy import create_engine
from config import config
from sqlalchemy.orm import sessionmaker, declarative_base
from contextlib import contextmanager
from sqlalchemy import text
from base import Base
import models

params = config()
engine = create_engine(f"postgresql://{params['user']}:{params['password']}@{params['host']}:{params['port']}/{params['database']}",
                       pool_size=5,
                       max_overflow=10,
                       pool_timeout=30,
                       pool_recycle=1800)

Session = sessionmaker(autoflush=False, bind=engine)

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
            result = conn.execute(text("SELECT version();"))
            for row in result:
                print("Connected to:", row)
        Base.metadata.create_all(bind=engine)
        print("Tables created successfully.")
    except Exception as e:
        print(e)