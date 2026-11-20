import { FeatureRows, CapabilityGrid, CtaBand, SectionHeading } from './sections';
export default function FeaturesPage() {
  return (<><div className="bg-lavender py-16"><div className="container"><SectionHeading eyebrow="Features" title="A complete reconstruction pipeline" description="AI reconstruction, photogrammetry, validation, game-asset optimisation and professional export — each step reporting what it actually measured." /></div></div><FeatureRows /><CapabilityGrid /><CtaBand /></>);
}
