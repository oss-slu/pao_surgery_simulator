from configparser import ConfigParser

def config(filename = 'database.ini', section = 'postgresql'):
    parser = ConfigParser()
    parser.read(filename)
    db = {}
    if section in parser:
        for key in parser[section]:
            db[key] = parser[section][key]
    else: 
        raise Exception('Section {0} not found in the {1} file'.format(section, filename))
    return db

if __name__ == '__main__':
    config()