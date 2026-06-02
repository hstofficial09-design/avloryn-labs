import { Preloader } from "@/components/layout/preloader";
import { ScrollProgress } from "@/components/layout/scroll-progress";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/sections/hero";
import { Philosophy } from "@/components/sections/philosophy";
import { Product } from "@/components/sections/product";
import { Vision } from "@/components/sections/vision";
import { Values } from "@/components/sections/values";
import { Story } from "@/components/sections/story";
import { Contact } from "@/components/sections/contact";

export default function HomePage() {
  return (
    <>
      <Preloader />
      <ScrollProgress />
      <Navbar />
      <main id="main">
        <Hero />
        <Philosophy />
        <Product />
        <Vision />
        <Values />
        <Story />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
