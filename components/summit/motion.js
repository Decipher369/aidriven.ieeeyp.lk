import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
gsap.registerPlugin(ScrollTrigger);
export function setupMotion(root, state, reduced) {
  let lenis, ticker, cursorTick, sceneTick, introTimeline;
  const triggers = new Map();
  const mobile = innerWidth < 650;
  const q = (selector) => root.querySelector(selector),
    all = (selector) => [...root.querySelectorAll(selector)];
  if (!reduced) {
    lenis = new Lenis({
      duration: 0.85,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.1,
    });
    lenis.on("scroll", ScrollTrigger.update);
    ticker = (time) => {
      if (!document.hidden) lenis.raf(time * 1000);
    };
    gsap.ticker.add(ticker);
    gsap.ticker.lagSmoothing(0);
  }
  const context = gsap.context(() => {
    if (reduced) {
      state.intro = 1;
      state.scene = "hero";
      return;
    }
    const titles = [q("[data-title-one]"), q("[data-title-two]")];
    const navReveal = gsap.fromTo(
      "[data-nav]",
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.25, ease: "power2.out", paused: true },
    );
    let navVisible = false,
      navScroll = window.scrollY,
      navDirection = 0,
      navTravel = 0;
    introTimeline = gsap.timeline({ paused: true });
    introTimeline.fromTo(
      state,
      { intro: 0 },
      { intro: 1, duration: 1.9, delay: 0.25, ease: "power2.inOut" },
    );
    const make = (name, length, extraDistance = () => 0) => {
      const section = q(`[data-scene="${name}"]`);
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () =>
            `+=${innerHeight * length * (mobile ? 0.75 : 1) + extraDistance()}`,
          pin: true,
          scrub: 0.78,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (self.isActive) {
              // Hand control to the scroll scene if the visitor moves on early.
              if (
                !introTimeline.paused() &&
                introTimeline.progress() < 1 &&
                (name !== "hero" || self.progress > 0.015)
              ) {
                introTimeline.progress(1).pause();
              }
              state.scene = name;
              state.progress = self.progress;
            }
          },
          onToggle: (self) => {
            if (self.isActive) {
              state.scene = name;
              state.progress = self.progress;
            }
          },
        },
      });
      tl.to({}, { duration: 100 }, 0);
      triggers.set(section.id || name, tl.scrollTrigger);
      return tl;
    };
    // The first 40 scroll units converge the titles; the following 100
    // preserve the existing hero sequence and its original scroll distance.
    const heroTimeline = make("hero", 3.36);
    heroTimeline
      .fromTo(
        titles,
        {
          x: (i, element) =>
            ((i === 0 ? -1 : 1) * (innerWidth + element.offsetWidth)) / 2,
          yPercent: (i) => (i === 0 ? -65 : 65),
          autoAlpha: 0,
        },
        {
          x: (i, element) =>
            (i === 0 ? -1 : 1) *
            (element.offsetWidth / 2 +
              innerWidth * (mobile ? 0.18 : 0.115) +
              16),
          autoAlpha: 1,
          duration: 13,
          stagger: 2,
          ease: "power3.out",
        },
        2,
      )
      .to(
        titles,
        {
          x: (i, element) => ((i === 0 ? 1 : -1) * element.offsetWidth) / 2,
          duration: 10,
          stagger: 2,
          ease: "power1.inOut",
        },
        20,
      )
      .set(titles, { autoAlpha: 0 }, 32)
      .fromTo(
        "[data-hero-ui]",
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 8 },
        32,
      )
      .fromTo(
        state,
        { heroProgress: 0 },
        { heroProgress: 1, duration: 100 },
        40,
      )
      .to("[data-hero-ui]", { autoAlpha: 0, y: 30, duration: 15 }, 62)
      .to("[data-scroll]", { autoAlpha: 0, duration: 10 }, 52)
      .fromTo(
        "[data-hero-stats]",
        { autoAlpha: 0, scale: 1.2 },
        { autoAlpha: 1, scale: 1, duration: 15 },
        83,
      )
      .to(
        "[data-hero-stats] > div",
        { x: (i) => (i % 2 ? -30 : 30), duration: 17 },
        97,
      )
      .to(
        "[data-hero-stats]",
        { yPercent: -110, autoAlpha: 0, duration: 15 },
        115,
      );
    const manifestoTimeline = make("manifesto", 1.6);
    manifestoTimeline
      .to(
        "[data-manifesto]",
        {
          x: () => -(q("[data-manifesto]").scrollWidth - innerWidth),
          duration: 94,
        },
        0,
      )
      .to(
        q('[data-scene="manifesto"]'),
        {
          color: "#fcf9e7",
          duration: 12,
        },
        88,
      );
    const aboutTimeline = make("about", 1.8);
    aboutTimeline
      .from(
        "[data-about-intro] h2",
        { clipPath: "inset(100% 0 0)", y: 80, duration: 18 },
        0,
      )
      .to(
        "[data-about-intro]",
        { yPercent: -60, autoAlpha: 0, duration: 16 },
        20,
      )
      .to("[data-purpose]", { autoAlpha: 1, duration: 5 }, 33)
      .from("[data-bring]", { scale: 2, autoAlpha: 0, duration: 12 }, 33)
      .from(
        "[data-converge]",
        {
          x: (i) => (i % 2 ? innerWidth : -innerWidth),
          y: (i) => (i < 2 ? -150 : 150),
          duration: 22,
        },
        40,
      )
      .to("[data-bring]", { autoAlpha: 0, scale: 0.5, duration: 10 }, 55)
      .to(
        "[data-converge]",
        {
          x: (i) => (i % 2 ? -innerWidth * 0.2 : innerWidth * 0.2),
          y: (i) => (i < 2 ? 80 : -80),
          autoAlpha: 0,
          scale: 0.65,
          duration: 17,
        },
        66,
      )
      .fromTo(
        "[data-one]",
        { autoAlpha: 0, scale: 0.8 },
        { autoAlpha: 1, scale: 1, duration: 16 },
        78,
      );
    const ecosystemTimeline = make("ecosystem", 2.4);
    ecosystemTimeline
      .to(
        "[data-ecosystem-title]",
        { xPercent: -30, yPercent: -25, autoAlpha: 0, duration: 22 },
        15,
      )
      .fromTo(
        "[data-ecosystem-final]",
        { autoAlpha: 0, y: 60 },
        { autoAlpha: 1, y: 0, duration: 14 },
        85,
      );
    const experienceTimeline = make("experience", 3.2);
    experienceTimeline.to(
      "[data-experience-title]",
      { scale: 0.85, transformOrigin: "0 0", autoAlpha: 0.4, duration: 18 },
      10,
    );
    const cards = all("[data-card]");
    cards.forEach((card, i) => {
      experienceTimeline
        .from(
          card,
          {
            y: innerHeight * 0.8,
            rotation: 18 - i * 3,
            autoAlpha: 0,
            duration: 14,
          },
          i === 0 ? 0 : 12 + i * 15,
        )
        .to(
          card,
          {
            x: () =>
              (i - 1.5) *
              (mobile
                ? Math.min(38, innerWidth * 0.1)
                : Math.min(innerWidth * 0.18, 245)),
            y: [20, -10, 7, 30][i],
            rotation: [-9, -3, 4, 10][i],
            rotationY: [5, 0, 0, -5][i],
            duration: 14,
          },
          68,
        )
        .to(card, { x: 0, y: 0, rotation: 0, rotationY: 0, duration: 11 }, 83);
    });
    experienceTimeline
      .set("[data-deck-wipe]", { autoAlpha: 1 }, 94)
      .to("[data-deck-wipe]", { scale: 16, duration: 6 }, 94);
    const programmeTimeline = make("programme", 3.5);
    const programmeRows = all("[data-programme-row]");
    gsap.set(programmeRows, { opacity: 0.8 });
    programmeRows.forEach((row, i) => {
      const start = i * 16;
      const ribbon = row.querySelector("[data-ribbon]");
      programmeTimeline
        .to(row, { opacity: 1, duration: 3 }, start)
        .set(ribbon, { autoAlpha: 1 }, start + 1)
        .fromTo(
          ribbon,
          { x: i % 2 ? -innerWidth : innerWidth },
          { x: i % 2 ? innerWidth : -innerWidth, duration: 14 },
          start + 1,
        )
        .set(ribbon, { autoAlpha: 0 }, start + 15);
      if (i < programmeRows.length - 1) {
        programmeTimeline.to(row, { opacity: 0.8, duration: 3 }, start + 13);
      }
    });
    programmeTimeline.to(programmeRows, { opacity: 1, duration: 4 }, 96);
    const registrationTimeline = make("invitation", 1.5);
    registrationTimeline.to(
      "[data-invitation]",
      {
        x: () => -(q("[data-invitation]").scrollWidth - innerWidth * 0.85),
        rotation: 8,
        yPercent: -20,
        duration: 100,
      },
      0,
    );
    const panel = q("[data-registration-panel]");
    const panelContent = q("[data-registration-content]");
    const panelTravel = () => {
      const style = getComputedStyle(panel);
      return Math.max(
        0,
        panelContent.scrollHeight +
          parseFloat(style.paddingTop) +
          parseFloat(style.paddingBottom) -
          panel.clientHeight,
      );
    };
    const panelTimeline = make("registration", 1.5, () => panelTravel() * 2);
    panelTimeline
      .from("[data-registration-panel]", { yPercent: 100, duration: 22 }, 0)
      .fromTo(
        panelContent,
        { y: 0 },
        { y: () => -panelTravel(), duration: 50 },
        28,
      )
      .fromTo(
        state,
        { registrationOffset: 0 },
        { registrationOffset: panelTravel, duration: 50 },
        28,
      )
      .to(
        "[data-circle]",
        { scale: () => Math.hypot(innerWidth, innerHeight) / 45, duration: 15 },
        85,
      );
    const partnersTimeline = make("partners", 1.8);
    partnersTimeline
      .to(
        "[data-partner-field]",
        {
          x: () => -(q("[data-partner-field]").scrollWidth - innerWidth * 0.86),
          duration: 70,
        },
        0,
      )
      .to(
        "[data-partner-group]",
        { y: (i) => (i % 2 ? 40 : -35), duration: 70 },
        0,
      )
      .to(
        "[data-partner-field]",
        { scale: 0.6, autoAlpha: 0, duration: 14 },
        72,
      )
      .to(
        "[data-partner-heading]",
        { yPercent: -50, autoAlpha: 0, duration: 14 },
        72,
      )
      .fromTo(
        "[data-partner-final]",
        { autoAlpha: 0, y: 80 },
        { autoAlpha: 1, y: 0, duration: 16 },
        84,
      );
    const faqTrigger = ScrollTrigger.create({
      trigger: "#faq",
      start: "top bottom",
      end: "bottom top",
      onToggle: (self) => {
        if (self.isActive) {
          state.scene = "faq";
          state.progress = 0;
        }
      },
    });
    triggers.set("faq", faqTrigger);
    const contactTimeline = make("contact", 0.6);
    contactTimeline
      .from(
        "[data-contact-heading]",
        { clipPath: "inset(0 100% 0 0)", duration: 22 },
        0,
      )
      .from(
        '[data-scene="contact"] [class*="contactInfo"]',
        { autoAlpha: 0, y: 25, duration: 18 },
        15,
      );
    // Information chapters share the same scroll controller and neutral WebGL state.
    all("[data-editorial]").forEach((section) => {
      const sceneTrigger = ScrollTrigger.create({
        trigger: section,
        start: "top center",
        end: "bottom center",
      });
      triggers.set(section.id, sceneTrigger);
    });
    // Each reveal follows its own visible content, not the height of a long chapter.
    all("[data-editorial-heading]").forEach((heading) => {
      gsap.from(heading, {
        clipPath: "inset(0 100% 0 0)",
        duration: 0.75,
        scrollTrigger: {
          trigger: heading,
          start: "top 90%",
          toggleActions: "play none none reverse",
        },
      });
    });
    ScrollTrigger.batch(all("[data-editorial-row]"), {
      start: "top 94%",
      onEnter: (batch) =>
        gsap.fromTo(
          batch,
          { clipPath: "inset(0 0 100% 0)" },
          {
            clipPath: "inset(0 0 0% 0)",
            duration: 0.6,
            stagger: 0.06,
            overwrite: true,
          },
        ),
      once: true,
    });
    all("[data-purpose-pair]").forEach((pair) => {
      const parts = pair.querySelectorAll(":scope > div");
      gsap
        .timeline({
          scrollTrigger: {
            trigger: pair,
            start: "top 85%",
            end: "bottom 60%",
            scrub: 0.4,
          },
        })
        .from(
          parts[1],
          { clipPath: "inset(0 100% 0 0)", x: 20, ease: "none" },
          0,
        )
        .to(parts[0], { opacity: 0.6, ease: "none" }, 0);
    });
    all("[data-legacy-logo]").forEach((logo, i) => {
      gsap.fromTo(
        logo,
        { y: i % 2 ? 14 : -14 },
        {
          y: i % 2 ? -14 : 14,
          ease: "none",
          scrollTrigger: {
            trigger: logo,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.6,
          },
        },
      );
    });
    all("[data-leader]").forEach((leader) => {
      gsap
        .timeline({
          scrollTrigger: {
            trigger: leader,
            start: "top 88%",
            toggleActions: "play none none reverse",
          },
        })
        .from(leader.querySelector("img"), {
          clipPath: "inset(100% 0 0 0)",
          duration: 0.7,
          ease: "power2.out",
        })
        .from(
          leader.querySelector(":scope > div"),
          { x: 22, duration: 0.6, ease: "power2.out" },
          0.15,
        );
    });
    sceneTick = () => {
      if (document.hidden) return;
      const y = window.scrollY;
      const delta = Math.max(0, y) - navScroll;
      navScroll = Math.max(0, y);
      if (delta !== 0) {
        const direction = Math.sign(delta);
        navTravel =
          direction === navDirection
            ? navTravel + Math.abs(delta)
            : Math.abs(delta);
        navDirection = direction;
        // Ignore tiny scroll adjustments; reveal only after upward movement.
        if (navTravel >= 8 || (y <= 0 && direction < 0)) {
          const reveal = direction < 0;
          if (reveal !== navVisible) {
            navVisible = reveal;
            if (reveal) navReveal.play();
            else navReveal.reverse();
          }
        }
      }
      for (const [name, trigger] of triggers) {
        if (y >= trigger.start && y <= trigger.end) {
          state.scene = name;
          state.progress = trigger.animation
            ? trigger.animation.progress()
            : trigger.progress;
          break;
        }
      }
    };
    gsap.ticker.add(sceneTick);
    if (matchMedia("(pointer:fine)").matches) {
      const cursor = q("[data-cursor]"),
        pos = { x: innerWidth / 2, y: innerHeight / 2 };
      const setX = gsap.quickSetter(cursor, "x", "px"),
        setY = gsap.quickSetter(cursor, "y", "px");
      cursorTick = () => {
        if (document.hidden) return;
        pos.x += (state.pointer.x * innerWidth - pos.x) * 0.18;
        pos.y += (state.pointer.y * innerHeight - pos.y) * 0.18;
        setX(pos.x);
        setY(pos.y);
        cursor.style.opacity = state.pointer.active ? "1" : "0";
      };
      gsap.ticker.add(cursorTick);
    }
  }, root);
  const hover = (e) => {
    if (e.target.closest("a,button"))
      gsap.to(q("[data-cursor]"), { scale: 3, duration: 0.2 });
  };
  const leave = (e) => {
    if (e.target.closest("a,button"))
      gsap.to(q("[data-cursor]"), { scale: 1, duration: 0.2 });
  };
  root.addEventListener("pointerover", hover);
  root.addEventListener("pointerout", leave);
  const refresh = () => ScrollTrigger.refresh();
  document.fonts.ready.then(refresh);
  window.addEventListener("load", refresh);
  const hash = location.hash.slice(1);
  const timer = setTimeout(() => {
    refresh();
    if (hash && document.getElementById(hash)) go(hash);
  }, 250);
  function go(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const trigger = triggers.get(id === "register" ? "registration" : id);
    let sceneProgress = id === "registration" ? 0.28 : 0;
    if (id === "register" && trigger) {
      const panel = q("[data-registration-panel]");
      const content = q("[data-registration-content]");
      const style = getComputedStyle(panel);
      const travel = Math.max(
        0,
        content.scrollHeight +
          parseFloat(style.paddingTop) +
          parseFloat(style.paddingBottom) -
          panel.clientHeight,
      );
      sceneProgress =
        0.28 + 0.5 * Math.min(1, target.offsetTop / Math.max(1, travel));
    }
    const position = trigger?.animation
      ? trigger.start +
        (sceneProgress ? (trigger.end - trigger.start) * sceneProgress : 1)
      : Math.max(0, window.scrollY + target.getBoundingClientRect().top - 84);
    if (lenis) lenis.scrollTo(position, { duration: 1.5 });
    else target.scrollIntoView({ behavior: "auto" });
    history.replaceState(null, "", `#${id}`);
  }
  return {
    go,
    refresh,
    startIntro() {
      introTimeline?.play();
    },
    destroy() {
      clearTimeout(timer);
      context.revert();
      lenis?.destroy();
      if (ticker) gsap.ticker.remove(ticker);
      if (cursorTick) gsap.ticker.remove(cursorTick);
      if (sceneTick) gsap.ticker.remove(sceneTick);
      root.removeEventListener("pointerover", hover);
      root.removeEventListener("pointerout", leave);
      window.removeEventListener("load", refresh);
    },
  };
}
