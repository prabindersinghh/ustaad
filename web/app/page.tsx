import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Fig1Learn from "@/components/Fig1Learn";
import Fig2Verify from "@/components/Fig2Verify";
import Fig3Decision from "@/components/Fig3Decision";
import Fig4Simulation from "@/components/Fig4Simulation";
import LiveLab from "@/components/LiveLab";
import Results from "@/components/Results";
import Architecture from "@/components/Architecture";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Fig1Learn />
      <Fig2Verify />
      <Fig3Decision />
      <Fig4Simulation />
      <LiveLab />
      <Results />
      <Architecture />
      <Footer />
    </main>
  );
}
