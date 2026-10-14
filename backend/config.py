import os
from configparser import ConfigParser

def config(filename='database.ini', section='postgresql'):
    env_params = {
        'host': os.getenv('DB_HOST'),
        'database': os.getenv('DB_NAME') or os.getenv('POSTGRES_DB'),
        'user': os.getenv('DB_USER') or os.getenv('POSTGRES_USER'),
        'password': os.getenv('DB_PASSWORD') or os.getenv('POSTGRES_PASSWORD'),
        'port': os.getenv('DB_PORT'),
    }
    if all(env_params.values()):
        return env_params

    parser = ConfigParser()
    parser.read(filename)
    db_params = {}
    if parser.has_section(section):
        params = parser.items(section)
        for param in params:
            db_params[param[0]] = param[1]
    else:
        raise Exception(f'Section {section} not found in the {filename} file')

    return db_params
