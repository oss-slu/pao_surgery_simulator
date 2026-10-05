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
            <header className="landing-banner">
                <div className="landing-brand-group">
                    <img
                        className="landing-logo"
                        src="/PAO_logo.png"
                        alt="PAO Surgery Simulator logo"
                    />
                    <p className="landing-brand">Surgery Simulator</p>
                </div>

                <button
                    className="landing-login-button"
                    type="button"
                    onClick={() => navigate("/dashboard")}
                >
                    Login
                </button>
            </header>

            <section className="landing-content">
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

            </section>
        </main>
    );
}

export default Landing;
