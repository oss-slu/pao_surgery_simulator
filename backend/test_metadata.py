import requests

response = requests.get("http://localhost:5000/api/render_dicom/fake-dicome-file/metadata")
print(response.status_code)
print(response.json())
print(response.json().get("error", {}))

