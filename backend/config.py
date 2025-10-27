import os
from dotenv import load_dotenv

load_dotenv()

def config():
    return {
        'host': os.getenv('host'),
        'database': os.getenv('database'),
        'user': os.getenv('user'),
        'password': os.getenv('password'),
        'port': os.getenv('port')
    }