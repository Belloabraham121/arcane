import { Navbar } from "@/components/navbar"
import { HeroSection } from "@/components/hero-section"
import { HowItWorksSection } from "@/components/how-it-works-section"
import { BenefitsSection } from "@/components/benefits-section"
import { FeatureGrid } from "@/components/feature-grid"
import { ArchitectureSection } from "@/components/architecture-section"
import { AboutSection } from "@/components/about-section"
import { GlitchMarquee } from "@/components/glitch-marquee"
import { Footer } from "@/components/footer"

export default function Page() {
  return (
    <div className="min-h-screen dot-grid-bg">
      <Navbar />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <BenefitsSection />
        <FeatureGrid />
        <ArchitectureSection />
        <AboutSection />
        <GlitchMarquee />
      </main>
      <Footer />
    </div>
  )
}
