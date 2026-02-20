"use client";
import { BulkDeployments } from "./bulk-deployments";

interface PageProps { params: { surveyId: string }; }
export default function BulkPage({ params }: PageProps) {
  return <BulkDeployments surveyId={params.surveyId} />;
}