export type MasteryStatus = "Red" | "Yellow" | "Green";

export type EmpireNode = {
  id: string;
  bookTitle: string;
  chapter: string;
  supportingContext: string;
  goldenThread: string;
  narrativeSprints: string[];
  tags: string[];
  sprintCount: number;
  masteryStatus: MasteryStatus;
  color: string;
  level: 0 | 1 | 2;
};

export type EmpireLink = {
  source: string;
  target: string;
  label: string;
};

export const knowledgeGraphData: { nodes: EmpireNode[]; links: EmpireLink[] } = {
  nodes: [
    {
      id: "z21_ch5",
      bookTitle: "Zero to One",
      chapter: "Chapter 5: Last Mover Advantage",
      supportingContext:
        "Thiel frames durable value creation as a race against imitation. The chapter explores how a company defends its position after early traction, and why strategic patience matters more than headline growth. He invites you to look past launch-day applause toward the quieter work of compounding advantage: systems that get sharper with scale, teams that learn faster than rivals can copy, and a narrative that stays coherent when the market inevitably turns skeptical.",
      goldenThread:
        "A proprietary technology must be 10x better than its closest substitute to create a true monopolistic advantage. In hospitality, your tech stack and standard operating procedures are your proprietary tech.",
      narrativeSprints: [
        "Most founders begin by celebrating product launch, but markets do not reward novelty for long. Customers compare outcomes, not intentions, and competitors study every visible advantage. The real strategic question is not whether you can enter a market, but whether you can remain meaningfully different after others react.",
        "Thiel argues that the clearest moat is technical depth that materially changes performance. A tenfold improvement is not a marketing slogan; it is the threshold where users feel friction returning to old habits. In restaurant operations, that same logic appears when an integrated prep-to-plate system removes waste and decision latency that manual workflows cannot match.",
        "Last mover advantage belongs to the firm that compounds capability while others copy surface features. As distribution scales, each process improvement strengthens margins and learning loops. Over time, the business stops competing on price alone and starts defining the category by setting the standard everyone else chases.",
        "The chapter closes with a sobering reminder: being first to market is worthless if you are first to plateau. The durable winner is the organization that keeps widening the gap between what it can deliver and what substitutes can credibly promise. That gap is built in small decisions—hiring, architecture, and refusal to chase me-too features—that rarely look heroic in the moment but define the trajectory for years.",
      ],
      tags: ["Scale", "Leverage"],
      masteryStatus: "Green",
      sprintCount: 8,
      color: "#10B981",
      level: 1,
    },
    {
      id: "cost_ch3",
      bookTitle: "Principles of Cost Controls",
      chapter: "Chapter 3: Cost/Volume/Profit",
      supportingContext:
        "This chapter translates finance theory into floor-level decisions. It shows how cover count, check average, and cost discipline interact as a single operating system rather than isolated metrics. The tone is deliberately practical: spreadsheets are not the goal—clarity under pressure is. When a service rush collides with a thin margin, the operator who understands break-even and contribution margin can steer the room without panic.",
      goldenThread:
        "Volume is the engine of profit. Because fixed costs remain constant, increasing the number of covers directly accelerates the bottom-line profit margin once the break-even point is crossed.",
      narrativeSprints: [
        "A dining room can look busy and still lose money if managers misread the relationship between cost structure and traffic. Fixed costs sit quietly in the background, charging rent on every slow shift. Profit does not begin when service starts; it begins only after those fixed obligations are absorbed.",
        "Cost-volume-profit analysis gives operators a practical dashboard: know your break-even covers, then engineer demand and throughput above that line. Every incremental guest beyond break-even carries disproportionate contribution because labor and occupancy overhead are already accounted for. The discipline is less about accounting compliance and more about tactical pacing.",
        "When teams internalize this model, pricing, menu mix, and promotion strategy become coordinated levers. A packed house is no longer celebrated blindly; it is measured by margin quality and production stability. Sustainable growth comes from pairing higher volume with controlled prime cost so revenue expansion translates into retained cash.",
        "The chapter’s closing emphasis is on communication: finance is a shared language between the kitchen, the floor, and ownership. When everyone can point to the same break-even number and the same target contribution per cover, debates shift from blame to alignment. That alignment is what turns a busy night into a profitable night, week after week.",
      ],
      tags: ["Scale", "Finance"],
      masteryStatus: "Yellow",
      sprintCount: 6,
      color: "#F59E0B",
      level: 1,
    },
    {
      id: "cost_ch1",
      bookTitle: "Principles of Cost Controls",
      chapter: "Chapter 1: Cost and Sales Concepts",
      supportingContext:
        "The opening chapter establishes financial literacy as a survival skill for operators. Before discussing growth, it insists on mastering the baseline economics that determine whether the business model can endure. It walks the reader from raw sales figures toward the idea that cost behavior—not buzz—determines whether hospitality businesses survive their first scaling season.",
      goldenThread:
        "Prime Cost (Food + Beverage + Labor) is the ultimate metric of operational survival. If this exceeds 60-65%, the business model is structurally flawed regardless of sales volume.",
      narrativeSprints: [
        "New operators often chase top-line momentum while the core expense engine quietly expands underneath them. Sales can rise week after week while cash position worsens if food, beverage, and labor are not disciplined in tandem. The chapter reframes success as control before expansion.",
        "Prime cost is introduced as the most honest mirror in hospitality. It reflects purchasing quality, prep discipline, staffing design, and service consistency in one consolidated signal. Unlike vanity metrics, it cannot be gamed for long because cash flow eventually exposes every leak.",
        "The managerial mandate is clear: build systems where recipe standards, scheduling logic, and procurement rules reinforce one another. Once prime cost remains in the safe band, growth becomes additive instead of fragile. Without that foundation, every additional cover can actually scale stress and insolvency risk.",
        "Finally, the text stresses that cost awareness is not cynicism toward guests or staff—it is respect for the craft. When operators understand the economics of a plate and the economics of a shift, they can invest in quality where it matters and cut waste where it does not. That balance is what keeps a restaurant both hospitable and solvent.",
      ],
      tags: ["Finance", "Operations"],
      masteryStatus: "Red",
      sprintCount: 4,
      color: "#EF4444",
      level: 1,
    },
    {
      id: "z21_ch3",
      bookTitle: "Zero to One",
      chapter: "Chapter 3: All Happy Companies are Different",
      supportingContext:
        "Thiel contrasts monopoly economics with the treadmill of perfect competition. The chapter argues that strategic clarity starts with how a company positions itself relative to substitutes, not just how well it executes day to day. The prose moves from abstract economics toward a simple test any founder can apply: if your customers can replace you without regret, you are not building a business—you are renting attention until the next competitor undercuts you.",
      goldenThread:
        "Perfect competition destroys profit. The goal is to capture value by creating a category of one, rather than fighting over margins in a commoditized market.",
      narrativeSprints: [
        "In competitive markets, firms obsess over rivals and gradually converge toward sameness. Product decisions become incremental, pricing power erodes, and teams confuse activity for progress. Thiel names this trap directly: when everyone looks alike, nobody captures durable value.",
        "Monopoly in this context is not about legal dominance; it is about delivering a combination of capability and perception that customers cannot replace without real loss. The strongest companies design around a specific truth, then extend that edge across product, distribution, and brand story. Their advantage feels coherent because each layer reinforces the same strategic identity.",
        "The practical lesson is to stop asking how to win a crowded game and start asking which game only you can credibly define. Category creation requires conviction and patience, but it protects margin and attention once established. Companies that achieve this are \"happy\" because they can invest long term instead of fighting quarter-to-quarter survival battles.",
        "Read as a hospitality parallel, the argument lands cleanly: a restaurant that competes only on discounts and Instagram aesthetics is fragile. A restaurant that owns a distinctive experience—rooted in sourcing, ritual, and operational craft—can widen the gap between itself and substitutes even when competitors copy the menu wording. Differentiation is not decoration; it is the economics of being irreplaceable.",
      ],
      tags: ["Leverage", "Finance"],
      masteryStatus: "Green",
      sprintCount: 7,
      color: "#10B981",
      level: 1,
    },
  ],
  links: [
    { source: "z21_ch5", target: "cost_ch3", label: "Scale crossover" },
    { source: "cost_ch3", target: "cost_ch1", label: "Finance crossover" },
    {
      source: "cost_ch3",
      target: "z21_ch3",
      label: "Finance/Leverage crossover",
    },
  ],
};
