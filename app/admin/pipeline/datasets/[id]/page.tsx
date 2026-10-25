import type { Metadata } from "next";
import { DatasetView } from "./DatasetView";

export const metadata: Metadata = { title: "Explorateur de dataset" };

export default function DatasetPage() {
  return <DatasetView />;
}
