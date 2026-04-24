import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Set API base URL for the API client
(window as any).__VITE_API_URL__ = import.meta.env.VITE_API_URL || "";

createRoot(document.getElementById("root")!).render(<App />);
