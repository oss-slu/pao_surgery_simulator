from sqlalchemy import create_engine
from config import config

def connect():
    try:
        params = config()
        connection_string = f"postgresql://{params['user']}:{params['password']}@{params['host']}:{params['port']}/{params['database']}"
        engine = create_engine(connection_string)
        connection = engine.connect()
        return connection
    except:
        return print("Connection failed")

if __name__ == '__main__':
    connection = connect()
    result = connection.execute("select version();")
    for row in result:
        print(row)
    connection.close()