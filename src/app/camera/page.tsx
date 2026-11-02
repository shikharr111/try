import type { Metadata } from "next";
import CameraClient from "./camera-client";

export const metadata: Metadata = {
  title: "Site camera · InfraTrack",
  robots: { index: false, follow: false },
};

export default function CameraPage() {
  return <CameraClient />;
}
