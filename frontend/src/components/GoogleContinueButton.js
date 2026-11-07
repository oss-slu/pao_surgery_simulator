import React, { useEffect, useRef, useState } from "react";
import {
  getGoogleClientId,
  handleGoogleCredentialResponse,
  loadGoogleIdentityScript,
} from "../googleAuth";

/**
 * Official Google Identity Services "Continue with Google" button.
 * Shared by login and signup; session handling stays in googleAuth.js.
 */
function GoogleContinueButton({
  apiBase,
  onSuccess,
  onError,
  onLoadingChange,
  disabled = false,
}) {
  const hostRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onLoadingChangeRef = useRef(onLoadingChange);
  const [configError, setConfigError] = useState("");

  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  onLoadingChangeRef.current = onLoadingChange;

  useEffect(() => {
    let cancelled = false;
    const clientId = getGoogleClientId();

    if (!clientId) {
      setConfigError(
        "Google sign-in is not configured. Set REACT_APP_GOOGLE_CLIENT_ID."
      );
      return undefined;
    }

    setConfigError("");

    void (async () => {
      try {
        await loadGoogleIdentityScript();
        if (cancelled || !hostRef.current || !window.google?.accounts?.id) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (!response?.credential) {
              // Popup closed / cancelled — GIS may call with an empty payload.
              onErrorRef.current?.(
                new Error("Google sign-in was cancelled.")
              );
              return;
            }
            onLoadingChangeRef.current?.(true);
            try {
              await handleGoogleCredentialResponse(apiBase, response, {
                onSuccess: (data) => onSuccessRef.current?.(data),
                onError: (error) => onErrorRef.current?.(error),
              });
            } catch {
              // onError already notified by the handler when provided.
            } finally {
              onLoadingChangeRef.current?.(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        hostRef.current.innerHTML = "";
        const width = Math.min(
          Math.max(hostRef.current.offsetWidth || 320, 240),
          400
        );
        window.google.accounts.id.renderButton(hostRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width,
        });
      } catch (error) {
        if (!cancelled) {
          setConfigError(
            error?.message || "Google sign-in is temporarily unavailable."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  return (
    <div className={`google-auth${disabled ? " google-auth-disabled" : ""}`}>
      <div className="auth-divider" aria-hidden="true">
        <span>or</span>
      </div>
      {configError ? (
        <p className="google-config-error">{configError}</p>
      ) : null}
      <div
        ref={hostRef}
        className="google-btn-host"
        data-testid="google-continue-host"
        aria-busy={disabled ? "true" : "false"}
      />
    </div>
  );
}

export default GoogleContinueButton;
