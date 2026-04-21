"use client";

import { useMemo } from "react";
import ForceGraph3D from "react-force-graph-3d";
import {
  EmpireNode,
  EmpireLink,
} from "@/lib/knowledge-empire-data";

type GraphNode = EmpireNode & { val: number; color: string };

type KnowledgeEmpireGraphProps = {
  nodes: EmpireNode[];
  links: EmpireLink[];
  onNodeClick?: (node: EmpireNode) => void;
};

export function KnowledgeEmpireGraph({
  nodes,
  links,
  onNodeClick,
}: KnowledgeEmpireGraphProps) {
  const graphData = useMemo(() => {
    const graphNodes: GraphNode[] = nodes.map((node) => ({
      ...node,
      val: Math.max(3, node.sprintCount * 1.8),
      color: node.color,
    }));

    const graphLinks = links.map((link) => ({ ...link }));
    return { nodes: graphNodes, links: graphLinks };
  }, [nodes, links]);

  return (
    <div className="h-screen w-screen bg-zinc-950">
      <ForceGraph3D
        graphData={graphData}
        backgroundColor="#09090b"
        nodeLabel={(node) => {
          const n = node as GraphNode;
          return `${n.chapter}
Book: ${n.bookTitle}
Mastery: ${n.masteryStatus}
Sprints: ${n.sprintCount}
Golden Thread: ${n.goldenThread}`;
        }}
        nodeColor={(node) => (node as GraphNode).color}
        nodeVal={(node) => (node as GraphNode).val}
        linkColor={() => "#3f3f46"}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleWidth={1.3}
        linkDirectionalParticleColor={() => "#a1a1aa"}
        linkLabel={(link) => (link as { label: string }).label}
        onNodeClick={(node) => onNodeClick?.(node as EmpireNode)}
      />

      <div className="pointer-events-none absolute left-6 top-6 max-w-xl rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 text-zinc-100 backdrop-blur">
        <h1 className="text-xl font-semibold tracking-tight">Knowledge Empire</h1>
        <p className="mt-2 text-sm text-zinc-300">
          Mastery Graph seeded from your two active books. Node color follows the
          Traffic Light protocol, node size maps to sprint volume, and links
          represent shared semantic threads like Efficiency and Scale.
        </p>
      </div>
    </div>
  );
}
