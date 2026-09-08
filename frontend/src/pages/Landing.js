import React from "react";
import { useNavigate } from "react-router-dom";
import "../components/LandingPage.css";

/**
 * Landing page (route: /)
 *
 * Displays an about page with a buttong to navigate to the login page.
 */

function Landing() {
    const navigate = useNavigate();

    return (
        <main className="landing-page">
            <section className="landing-content">
                <p className="landing-brand">PAO Surgery Simulator</p>

                <h1>Plan with confidence.</h1>

                <p className="landing-subtitle">
                    Pao Surgery Simulator is a web-based 3D visualization software 
                    that surgeons can manipulate to simulate different types of pelvic
                    osteotomy procedures. These virtual osteotomies can help calculate
                    radiographic measures, assisting in determining the best surgical
                    approach, and supporting personalized surgical planning for
                    improved patient outcomes. The simulator uses uploaded CT DICOM files
                    for its visualization. 
                </p>

                <button
                    className="landing-login-button"
                    type="button"
                    onClick={() => navigate("/login")}
                >
                    Go to Login
                </button>
            </section>
        </main>
    );
}

export default Landing;