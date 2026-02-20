"use client";

import { DeploymentCreator } from "./deployment-creator";

interface PageProps {
  params: { surveyId: string };
}

export default function NewDeploymentPage({ params }: PageProps) {
  return <DeploymentCreator surveyId={params.surveyId} />;
}