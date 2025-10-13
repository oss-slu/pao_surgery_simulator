import psycopg2
from config import config

def create_tables():
    commands = (
        """
        CREATE TABLE patients (
            patient_id SERIAL PRIMARY KEY,
            patient_name VARCHAR(255) NOT NULL,
            patient_age INTEGER NOT NULL,
            date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE images (
            image_id SERIAL PRIMARY KEY,
            patient_id INTEGER NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            file_type VARCHAR(255) NOT NULL,
            upload_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id)
                REFERENCES patients (patient_id)
                ON UPDATE CASCADE ON DELETE CASCADE
        )
        """
    )
    conn = None
    try:
        params = config()
        conn = psycopg2.connect(**params)
        cur = conn.cursor()
        for command in commands:
            cur.execute(command)
        cur.close()
        conn.commit()
    except (Exception, psycopg2.DatabaseError) as error:
        print(error)
    finally:
        if conn is not None:
            conn.close()

if __name__ == '__main__':
    create_tables()