from typing import List
from sqlalchemy import ForeignKey
from sqlalchemy import String
from sqlalchemy import Integer
from sqlalchemy import TIMESTAMP
from sqlalchemy import func
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy.orm import relationship
from db import Base

class Patient(Base):
    __tablename__ = "patients"
    patient_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    patient_age: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped = mapped_column(TIMESTAMP, server_default=func.now())
    images: Mapped[List["Image"]] = relationship("Image", back_populates="patient", cascade="all, delete-orphan")

class Image(Base):
    __tablename__ = "images"
    image_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.patient_id"), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(255), nullable=False)
    upload_date: Mapped = mapped_column(TIMESTAMP, server_default=func.now())
    patient: Mapped["Patient"] = relationship("Patient", back_populates="images")

if __name__ == '__main__':
    from db import engine
    Base.metadata.create_all(bind=engine)