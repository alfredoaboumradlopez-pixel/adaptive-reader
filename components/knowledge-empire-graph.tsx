"use client";

import { useEffect, useMemo, useRef } from "react";
import ForceGraph3D from "react-force-graph-3d";
import { EmpireNode, EmpireLink } from "@/lib/knowledge-empire-data";

type GraphNode = EmpireNode & { val: number; color: string };

type KnowledgeEmpireGraphProps = {
  nodes: EmpireNode[];
  links: EmpireLink[];
  /** Node colour per id (mastery); nodes without one use `fallbackColor`. */
  colors?: Record<string, string>;
  fallbackColor?: string;
  background?: string;
  onNodeClick?: (node: EmpireNode) => void;
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function KnowledgeEmpireGraph({
  nodes,
  links,
  colors = {},
  fallbackColor = "#b5b1a6",
  background = "#f6f5f1",
  onNodeClick,
}: KnowledgeEmpireGraphProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(undefined);
  const fitted = useRef(false);

  const graphData = useMemo(() => {
    const graphNodes: GraphNode[] = nodes.map((node) => ({
      ...node,
      val: Math.max(3, (node.narrativeSprints?.length ?? 3) * 1.8),
      color: colors[node.id] ?? fallbackColor,
    }));
    const ids = new Set(graphNodes.map((n) => n.id));
    const graphLinks = links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((link) => ({ ...link }));
    return { nodes: graphNodes, links: graphLinks };
  }, [nodes, links, colors, fallbackColor]);

  // Frame the nodes shortly after data arrives even if the engine hasn't settled.
  useEffect(() => {
    const t = window.setTimeout(() => fgRef.current?.zoomToFit(600, 40), 1800);
    return () => window.clearTimeout(t);
  }, [graphData.nodes.length]);

  return (
    <div className="h-[100dvh] w-full" style={{ background }}>
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData}
        nodeRelSize={6}
        cooldownTicks={120}
        showNavInfo={false}
        onEngineStop={() => {
          if (fitted.current) return;
          fitted.current = true;
          fgRef.current?.zoomToFit(600, 40);
        }}
        backgroundColor={background}
        nodeLabel={(node) => {
          const n = node as GraphNode;
          return `<div style="max-width:240px;padding:8px 10px;border-radius:10px;background:#17181c;color:#f6f5f1;font:13px/1.35 system-ui">${escapeHtml(
            n.chapter,
          )}</div>`;
        }}
        nodeColor={(node) => (node as GraphNode).color}
        nodeVal={(node) => (node as GraphNode).val}
        nodeOpacity={0.95}
        linkColor={() => "#8f8b80"}
        linkOpacity={0.6}
        linkWidth={0.6}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.004}
        linkDirectionalParticleWidth={1.3}
        linkDirectionalParticleColor={() => "#2f5bea"}
        linkLabel={(link) => escapeHtml((link as { label: string }).label ?? "")}
        onNodeClick={(node) => onNodeClick?.(node as EmpireNode)}
      />
    </div>
  );
}
