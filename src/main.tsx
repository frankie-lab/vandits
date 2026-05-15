import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// Camera QA harness: installs window.__resetCameraQa / __startCameraCapture
// / __exportCameraQa for Playwright. Inert until called. Safe in prod.
import "./components/debug/camera-qa-globals";
// force rebuild

createRoot(document.getElementById("root")!).render(<App />);
