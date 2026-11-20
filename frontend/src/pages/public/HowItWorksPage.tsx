import { HowItWorks, CtaBand, SectionHeading } from './sections';
import { CaptureRingIllustration } from '@/components/brand/Illustrations';
export default function HowItWorksPage() {
  return (
    <>
      <HowItWorks detailed />
      <section className="container grid items-center gap-10 pb-20 lg:grid-cols-2">
        <div>
          <SectionHeading center={false} eyebrow="Capture" title="Capture in rings, keep overlap high" description="Walk around the object at two or three heights, taking a photo every 10–15°. Keep the object filling most of the frame, avoid motion blur, and use soft, even lighting." />
        </div>
        <CaptureRingIllustration className="mx-auto w-full max-w-md" />
      </section>
      <CtaBand />
    </>
  );
}
