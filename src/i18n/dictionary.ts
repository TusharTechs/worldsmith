/** English source-of-truth for every translated string on the site (landing page + global chrome).
 * Toolbox tool pages (src/app/tools/page.tsx generated copy) are a separate, much larger phase — not covered here yet.
 * Deliberately NOT `as const` — every leaf must widen to plain `string` so translated locale
 * dictionaries (which assign different string values at the same keys) type-check against `Dictionary`. */
export const en: {
  nav: { explore: string; showcase: string; categories: { image: string; video: string; audio: string; edit: string; social: string } };
  tools: Record<"t2i" | "t2v" | "i2v" | "flow" | "tts" | "i2p" | "upscale" | "text" | "social" | "ytkit" | "cast", string>;
  home: {
    hero: { kicker: string; titlePre: string; titleStrong: string; subtitle: string; ctaPrimary: string; ctaSecondary: string; stat1: string; stat2: string; stat3: string; offerPre: string; offerPost: string; statTools: string; statPlatforms: string };
    poweredBy: string;
    showcaseGrid: {
      imagesKicker: string; imagesHeadingPre: string; imagesHeadingStrong: string; imagesSubtitle: string;
      videosKicker: string; videosHeadingPre: string; videosHeadingStrong: string; videosSubtitle: string;
    };
    pipeline: { headingPre: string; headingStrong: string; subtitle: string; steps: { label: string; desc: string }[] };
    showcase: { headingPre: string; headingStrong: string; subtitle: string; items: string[] };
    flagship: { headingPre: string; headingStrong: string; subtitle: string; open: string; items: { tag: string; title: string; desc: string }[] };
    vs: { heading: string; caption: string; capability: string; worldsmith: string; typical: string; rows: string[] };
    pricing: {
      headingPre: string; headingStrong: string; subtitle: string; monthly: string; annual: string; annualDiscount: string;
      currentPlan: string; upgradeTo: string; switchTo: string; choose: string; creditsPerMonth: string; active: string; mostPopular: string;
      perks: Record<"prodCreator" | "allTools" | "continuityQc" | "campaign8" | "everythingCreator" | "prodStudio" | "prod30" | "creditsRoll" | "everythingStudio" | "prodAgency" | "prod30x4", string>;
      topupHeading: string; topupSubtitle: string; claimPurchase: string;
      promoHeading: string; promoSubtitle: string; builtOn: string;
      saveAnnual: string; packSaving: string; packBase: string;
    };
    redeem: { cta: string; busy: string; label: string; error: string };
    claim: {
      appliedTitle: string; verifyTitle: string; notFoundTitle: string;
      appliedBody: string; newBalance: string;
      verifyBody: string; sendVerification: string; sending: string; sent: string; sendError: string;
      notFoundBody: string; notFoundHelp: string; emailSupport: string;
      showDetails: string; hideDetails: string; close: string;
    };
    faq: { heading: string; items: { q: string; a: string }[] };
    finalCta: { headingPre: string; headingStrong: string; cta: string };
    exploreMore: { heading: string; tags: string[] };
    footer: {
      columns: { image: string; video: string; distribute: string; company: string; follow: string };
      links: { campaign8: string; textEditor: string; pricing: string; studio: string; showcase: string; home: string };
      brand: string; techStack: string;
    };
  };
  studio: {
    nav: string;
    composer: {
      yourIdea: string; surpriseMe: string; placeholder: string;
      look: string; lookCustom: string; runtime: string;
      build: string; building: string; credits: string; balance: string; topUp: string;
    };
    timeline: string;
    projects: { heading: string; restore: string; search: string; empty: string };
    status: { partial: string; shipped: string; filmReady: string; rendering: string; planned: string; running: string };
    tabs: { label: string; story: string; assets: string; film: string; distribute: string; telemetry: string };
    engine: {
      title: string; reasoning: string; research: string; image: string; video: string;
      qc: string; distribution: string; narration: string; storage: string; note: string; live: string;
    };
    empty: {
      kicker: string; titlePre: string; titleStrong: string; subtitle: string;
      madeBy: string; stats: string; whatHappens: string; play: string;
      beats: { title: string; desc: string }[];
    };
  };
  account: {
    free: string; planSuffix: string; credits: string; creditsLeft: string; goPremium: string; upgrade: string;
    viewProfile: string; manageAccount: string; language: string; signOut: string; login: string; signUp: string;
    notSignedIn: string; notSignedInSubtitle: string; signIn: string; renewsOn: string; endsOn: string; billedCycle: string;
  };
  auth: {
    welcomeBack: string; createStudio: string; modalSubtitle: string; continueGoogle: string; or: string;
    emailPlaceholder: string; passwordPlaceholder: string; signIn: string; createAccount: string; oneMoment: string;
    newHere: string; createAccountLink: string; alreadyHaveAccount: string;
    errors: {
      wrongPassword: string; emailInUse: string; weakPassword: string; invalidEmail: string; popupClosed: string;
      unauthorizedDomain: string; operationNotAllowed: string; popupBlocked: string;
      networkFailed: string; configProblem: string; generic: string;
    };
  };
  billingSuccess: { title: string; applying: string; applyingNote: string; signInToAttach: string;
    signInToClaim: string; openStudio: string; subscription: string; home: string; applied: string;
    balanceNow: string; credits: string; attentionTitle: string; attentionBody: string;
    technicalDetails: string; stayHere: string };
} = {
  nav: {
    explore: "Explore",
    showcase: "Showcase",
    categories: { image: "Image", video: "Video", audio: "Audio", edit: "Edit", social: "Social" },
  },
  tools: {
    t2i: "Text → Image",
    t2v: "Text → Video",
    i2v: "Image → Video",
    flow: "Voiceover + Images → Video",
    tts: "Text → Speech",
    i2p: "Image → Prompt",
    upscale: "Upscale Image",
    text: "Creative Text Editor",
    social: "Social Post",
    ytkit: "YouTube Kit",
    cast: "Cast",
  },
  home: {
    hero: {
      kicker: "Autonomous AI Media Studio",
      titlePre: "Tell us what you want ",
      titleStrong: "the world to see.",
      subtitle:
        "Worldsmith researches the opportunity, builds the world, directs the production, generates every asset and continuity-checks every shot, assembles the film, narrates it, and ships the campaign to 8 platforms. One idea in. A complete production out — or just a single thumbnail, upscale, or post, on its own.",
      ctaPrimary: "Start Creating — Free",
      ctaSecondary: "Watch a Real Production",
      stat1: "platform campaign per film",
      stat2: "continuity checks per shot",
      stat3: "hidden generation costs",
      offerPre: "20 free credits with code",
      offerPost: "no card required",
      statTools: "tools in one studio",
      statPlatforms: "platforms per campaign",
    },
    poweredBy: "Built on · Gemini · Veo · Vertex AI · Google Cloud · Parallel Search · FFmpeg ·",
    showcaseGrid: {
      imagesKicker: "Image generation",
      imagesHeadingPre: "Any style. ",
      imagesHeadingStrong: "Studio quality, every time.",
      imagesSubtitle: "From ad campaigns to gallery posters — every still below was generated end-to-end, text and all, by Worldsmith.",
      videosKicker: "Video generation",
      videosHeadingPre: "Director-level motion, ",
      videosHeadingStrong: "one prompt away.",
      videosSubtitle: "Veo-powered clips with cinematic camera work — no shot list, no crew, no editing suite.",
    },
    pipeline: {
      headingPre: "Not a generator. ",
      headingStrong: "A studio.",
      subtitle:
        "Other tools give you a clip. Worldsmith runs the full production loop — and keeps creative context from first signal to final post.",
      steps: [
        { label: "DISCOVER", desc: "Parallel Search scans live trends & audience signals." },
        { label: "THINK", desc: "Gemini finds the content opportunity and angle." },
        { label: "CREATE", desc: "World Bible, storyboard, characters, environments." },
        { label: "PRODUCE", desc: "Frames → Veo video → VLM continuity QC → FFmpeg assembly." },
        { label: "DISTRIBUTE", desc: "One click: 8-platform campaign, creatives, titles, hashtags." },
        { label: "LEARN", desc: "Performance feeds back into the next discovery." },
      ],
    },
    showcase: {
      headingPre: "Made by Worldsmith. ",
      headingStrong: "All of it.",
      subtitle:
        "Every asset below — film, frames, sheets, plates — was produced autonomously by one run of the pipeline, then QC'd and assembled.",
      items: [
        // Plain language: a visitor doesn't know what "Stage-B QC'd" or a "plate" is. Each label
        // names the craft role instead, which still makes the point that one run produced all of it.
        "The finished film — scored and narrated",
        "Character design — every angle, one pass",
        "The world it lives in",
        "Concept art for the opening shot",
        "A close-up, still on-model",
        "The shot that opens the film",
      ],
    },
    flagship: {
      headingPre: "Four ways in. ",
      headingStrong: "One studio.",
      subtitle:
        "From a full autonomous production down to a single on-brand post — each one a complete experience on its own.",
      open: "Open →",
      items: [
        {
          tag: "Autonomous", title: "Studio",
          desc: "One idea in. A complete production out — researched, world-built, storyboarded, generated, QC'd, assembled, narrated.",
        },
        {
          tag: "New", title: "Cast",
          desc: "Build a character once. Drop them into any new scene, any platform, one click at a time — different scenes, same star.",
        },
        {
          tag: "Standalone", title: "Social Post",
          desc: "One idea in. On-brand copy and a matching creative out — for Instagram, TikTok, X, LinkedIn, Facebook, or Pinterest.",
        },
        {
          tag: "Standalone", title: "YouTube Kit",
          desc: "A prompt in. A finished video, a matching thumbnail, and titles/description/tags out — generated together.",
        },
      ],
    },
    vs: {
      // The comparison column used to read "Typical AI video tools" and put a cross beside every
      // row — an unfalsifiable claim about other people's products, and the kind of sweep a reader
      // discounts on sight. Contrasting the approach instead is both verifiable and the actual
      // argument: these are things one model call cannot do, whoever is making it.
      heading: "What a pipeline does that a prompt can't.",
      caption: "Every row is something Worldsmith does on its own, unprompted, as part of one run.",
      capability: "Capability",
      worldsmith: "Worldsmith",
      typical: "A single generation call",
      rows: [
        "Live trend & audience research",
        "Persistent World Bible & continuity rules",
        "VLM continuity QC with human approval gates",
        "Deterministic assembly + narration sync",
        "8-platform campaign + on-model creatives + text editor",
        "Standalone tools — thumbnail, upscale, social post, no pipeline required",
        "Transparent per-asset cost ledger",
      ],
    },
    pricing: {
      headingPre: "Simple credits. ",
      headingStrong: "Pay for what you render.",
      subtitle: "Stills cost 5 credits. Video costs 40 per second of render, in fixed 8-second Veo clips — a finished 15-second production runs about 1,050. Unused credits carry over for as long as your subscription is active.",
      monthly: "Monthly",
      annual: "Annual",
      annualDiscount: "−20%",
      currentPlan: "✓ Current Plan",
      upgradeTo: "Upgrade to {plan}",
      switchTo: "Switch to {plan}",
      choose: "Choose {plan}",
      creditsPerMonth: "credits / month",
      active: "Active",
      mostPopular: "Most popular",
      // Every claim here is something the product does today. The plans differ by volume, not by
      // features, so they say so — an unbuilt perk on a paid tier is a false advertisement.
      perks: {
        prodCreator: "One 15-second production a month, or 240 stills",
        allTools: "All 11 tools and the full Studio pipeline",
        continuityQc: "Every shot continuity-checked against your World Bible",
        campaign8: "An 8-destination campaign with every production",
        everythingCreator: "Everything in Creator",
        prodStudio: "Three 15-second productions a month, or 660 stills",
        prod30: "Room for a 30-second production in one run",
        creditsRoll: "Unused credits carry over while you stay subscribed",
        everythingStudio: "Everything in Studio",
        prodAgency: "Seven 15-second productions a month, or 1,640 stills",
        prod30x4: "Or four 30-second productions",
      },
      topupHeading: "Need more? Credit top-up packs",
      topupSubtitle: "For months when you ship a lot — never expire, stack on any plan.",
      claimPurchase: "Already paid? Claim purchase",
      saveAnnual: "Save ${amount} a year · {percent}% off",
      packSaving: "{percent}% better per credit",
      packBase: "Starter rate",
      promoHeading: "Got a code?",
      promoSubtitle: "Redeem a promo code for free credits — one claim per account.",
      builtOn: "Built on",
    },
    redeem: {
      cta: "Redeem",
      busy: "Checking",
      label: "Promo code",
      error: "Could not redeem that code.",
    },
    claim: {
      appliedTitle: "Purchase applied",
      verifyTitle: "Verify your email",
      notFoundTitle: "No payment found",
      appliedBody: "We found your payment and added {granted} to your account.",
      newBalance: "New balance: {credits} credits",
      verifyBody: "Payments are matched to your account by email address, so {email} has to be confirmed first. Click the link we send you, then try again.",
      sendVerification: "Send verification email",
      sending: "Sending…",
      sent: "Verification email sent",
      sendError: "Couldn't send it just now — try again in a minute.",
      notFoundBody: "No unclaimed payment is linked to {email}.",
      notFoundHelp: "If you paid with a different email address, sign in with that one. Credits from a successful payment normally land within a few seconds — nothing here means we have nothing on file yet, and this button never grants credits on its own.",
      emailSupport: "Email support →",
      showDetails: "Show technical details",
      hideDetails: "Hide technical details",
      close: "Close",
    },
    faq: {
      heading: "Questions, answered.",
      items: [
        {
          q: "Is the film really autonomous?",
          a: "Yes. One idea triggers research, world-building, storyboarding, generation, QC, assembly, narration and the distribution campaign. You approve expensive steps; the studio does the rest.",
        },
        {
          q: "What models power it?",
          a: "Google Gemini and Veo on Vertex AI, Parallel Search for live research, FFmpeg for deterministic assembly. No black-box third-party AI.",
        },
        {
          q: "Do I own what I make?",
          a: "Worldsmith claims no ownership of anything you generate — your projects and assets are yours, on every plan including the free trial. Output is produced by Google's Gemini and Veo models, so Google's generative-AI terms govern how it may be used, commercially included.",
        },
        {
          q: "Can I use just one tool?",
          a: "Yes. Every tool runs on its own — text→image, text→video, image→video, voiceover+images→video, speech, image→prompt, upscale, social post, YouTube kit, Cast and the creative text editor. All are credit-metered and none require a full production.",
        },
        {
          q: "What happens if a generation fails?",
          a: "You are not charged for it. Credits are reserved before a model is called and returned in full if nothing usable comes back, so a failed shot costs you nothing and a run that hits its limit stops before spending rather than after.",
        },
        {
          q: "Do unused credits expire?",
          a: "No. Monthly credits are added to your balance rather than replacing it, so anything you do not spend carries over while your subscription stays active. Top-up packs never expire and stack on top of any plan.",
        },
        {
          q: "Who can see my projects?",
          a: "Only you. Projects and generated assets are scoped to the account that made them, and nothing is shared or published anywhere unless you download it and post it yourself.",
        },
        {
          q: "Can I buy the same plan twice?",
          a: "No — one active subscription per account. Your current plan shows as Active; you can upgrade or switch, and every renewal re-grants the monthly credits. Packs stack on top anytime.",
        },
      ],
    },
    // The free trial is 15 credits. A production costs about 1,047, so a first production was
    // never free — 15 credits is three stills. Promise what the trial actually buys.
    finalCta: { headingPre: "Try it free. ", headingStrong: "No card required.", cta: "Open Worldsmith Studio" },
    exploreMore: {
      heading: "Explore more of Worldsmith",
      tags: [
        "Autonomous Studio",
        "Cast — Character Consistency",
        "Social Post",
        "YouTube Kit",
        "Text → Image",
        "Text → Video",
        "Image → Video",
        "Voiceover + Images → Video",
        "Text → Speech",
        "Image → Prompt",
        "Upscale Image",
        "World Bible",
        "Continuity QC",
        "Creative Text Editor",
        "8-Platform Distribution",
        "YouTube Thumbnails",
        "Instagram Reels",
        "TikTok Covers",
        "Pinterest Pins",
        "X Cards",
        "LinkedIn Posts",
      ],
    },
    footer: {
      columns: { image: "Image", video: "Video", distribute: "Distribute", company: "Company", follow: "Follow" },
      links: {
        campaign8: "8-Platform Campaign",
        textEditor: "Creative Text Editor",
        pricing: "Pricing",
        studio: "Studio",
        showcase: "Showcase",
        home: "Home",
      },
      brand: "Autonomous Media Production",
      techStack: "Gemini · Veo · Vertex · Parallel · © 2026",
    },
  },
  studio: {
    nav: "Studio",
    composer: {
      yourIdea: "Your idea",
      surpriseMe: "Surprise me",
      placeholder: "One sentence. Who is it about, and what happens to them?",
      look: "Look",
      lookCustom: "…or describe your own",
      runtime: "Runtime",
      build: "Build my world",
      building: "Building your world…",
      credits: "≈ {n} credits",
      balance: "balance {n}",
      topUp: "Top up to run this →",
    },
    timeline: "Production timeline",
    projects: { heading: "Productions", restore: "↺ Restore", search: "Search productions", empty: "No matching productions." },
    status: { partial: "Partial", shipped: "Shipped", filmReady: "Film ready", rendering: "Rendering", planned: "Planned", running: "Running" },
    tabs: { label: "Production", story: "Story", assets: "Assets", film: "Film", distribute: "Distribute", telemetry: "Telemetry" },
    engine: {
      title: "Engine",
      reasoning: "Reasoning", research: "Research", image: "Image", video: "Video",
      qc: "Continuity QC", distribution: "Distribution", narration: "Narration", storage: "Storage",
      note: "Every model in the pipeline is a Google model. Research runs on Parallel.",
      live: "{n}/{m} live",
    },
    empty: {
      kicker: "Nothing loaded",
      titlePre: "Describe a film. Get a ",
      titleStrong: "production",
      subtitle: "Not a clip — a world bible, a storyboard, continuity-checked footage, a cut, a narration track, and a campaign. Start on the left, or open a past production.",
      madeBy: "Made by this pipeline",
      stats: "11 assets · 0 failures · 1 run",
      whatHappens: "What happens when you press build",
      play: "Play the showreel",
      beats: [
        { title: "Research", desc: "Live web signals become a real content opportunity" },
        { title: "Direction", desc: "Those signals turn into an angle worth filming" },
        { title: "World Bible", desc: "Characters, locations and visual rules, written down" },
        { title: "Storyboard", desc: "A shot list, each with its own continuity contract" },
        { title: "Production", desc: "Frames, then Veo clips — every one continuity-checked" },
        { title: "Distribution", desc: "One film becomes a campaign across 8 platforms" },
      ],
    },
  },
  account: {
    free: "Free",
    planSuffix: "Plan",
    credits: "Credits",
    creditsLeft: "left",
    goPremium: "Go Premium",
    upgrade: "Upgrade",
    viewProfile: "View profile",
    manageAccount: "Manage account",
    language: "Language",
    signOut: "Sign out",
    login: "Login",
    signUp: "Sign up",
    notSignedIn: "You're not signed in",
    notSignedInSubtitle: "Sign in to view your account.",
    signIn: "Sign in",
    renewsOn: "Renews {date}",
    endsOn: "Access ends {date}",
    billedCycle: "Billed {cycle}",
  },
  auth: {
    welcomeBack: "Welcome back",
    createStudio: "Create your studio",
    modalSubtitle: "Sign in to create productions, use the toolbox, and keep every project saved to your account.",
    continueGoogle: "Continue with Google",
    or: "or",
    emailPlaceholder: "you@studio.com",
    passwordPlaceholder: "Password",
    signIn: "Sign in",
    createAccount: "Create account",
    oneMoment: "One moment...",
    newHere: "New here?",
    createAccountLink: "Create an account",
    alreadyHaveAccount: "Already have an account?",
    errors: {
      wrongPassword: "Incorrect email or password.",
      emailInUse: "That email already has an account — sign in instead.",
      weakPassword: "Password must be at least 6 characters.",
      invalidEmail: "That doesn't look like a valid email.",
      popupClosed: "Google sign-in was cancelled.",
      unauthorizedDomain: "Add this domain to Firebase Auth → Authorized domains.",
      operationNotAllowed: "Enable this sign-in method in Firebase Console → Authentication.",
      popupBlocked: "Your browser blocked the sign-in window — allow popups and try again.",
      networkFailed: "Couldn't reach the sign-in service. Check your connection and try again.",
      configProblem: "Sign-in is misconfigured for this site. Please let us know.",
      generic: "Sign-in failed. Try again.",
    },
  },
  billingSuccess: {
    title: "Thank you — payment received",
    applying: "Applying your purchase…",
    applyingNote: "This usually takes a few seconds.",
    signInToAttach: "Sign in to attach this purchase to your account.",
    signInToClaim: "Sign in to claim",
    openStudio: "Open Studio",
    subscription: "Subscription",
    home: "Home",
    applied: "Applied to your account",
    balanceNow: "Balance now",
    credits: "credits",
    attentionTitle: "Payment received — one more step",
    attentionBody: "We couldn't match this payment to your account automatically. Open the pricing page and use \u201CAlready paid? Claim purchase\u201D.",
    technicalDetails: "Technical details",
    stayHere: "Stay on this page while we apply it.",
  },
};

export type Dictionary = typeof en;

/** Recursively optional. Locale files use this so a translation can omit any key (or any whole
 * branch) and fall back to English at lookup time — otherwise adding one new English key would
 * break every locale file until all of them were re-translated. */
export type DeepPartial<T> = T extends readonly (infer U)[]
  ? readonly DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type PartialDictionary = DeepPartial<Dictionary>;
