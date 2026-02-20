import { SurveyDetail } from "./survey-detail";

interface PageProps {
  params: { surveyId: string };
}

export default function SurveyPage({ params }: PageProps) {
  return <SurveyDetail surveyId={params.surveyId} />;
}