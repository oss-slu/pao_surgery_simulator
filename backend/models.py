from typing import List
from sqlalchemy import ForeignKey
from sqlalchemy import String
from sqlalchemy import Integer
from sqlalchemy import TIMESTAMP
from sqlalchemy import func
from sqlalchemy import Date
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column
from sqlalchemy.orm import relationship
from base import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_name: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    user_email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    user_birthdate: Mapped[datetime] = mapped_column(Date, nullable=False)
    user_password: Mapped[str] = mapped_column(String(255), nullable=False)
    patients: Mapped[List["Patient"]] = relationship("Patient", back_populates="user", cascade="all, delete-orphan")
    images: Mapped[List["Image"]] = relationship("Image", back_populates="user", cascade="all, delete-orphan")


class Patient(Base):
    __tablename__ = "patients"
    patient_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    patient_age: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    user: Mapped["User"] = relationship("User", back_populates="patients")
    images: Mapped[List["Image"]] = relationship("Image", back_populates="patient", cascade="all, delete-orphan")

class Image(Base):
    __tablename__ = "images"
    image_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.patient_id"), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(255), nullable=False)
    upload_date: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=func.now())
    user: Mapped["User"] = relationship("User", back_populates="images")
    patient: Mapped["Patient"] = relationship("Patient", back_populates="images")