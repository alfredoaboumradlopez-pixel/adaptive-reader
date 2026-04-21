(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/components/knowledge-empire-graph.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "KnowledgeEmpireGraph",
    ()=>KnowledgeEmpireGraph
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$force$2d$graph$2d$3d$2f$dist$2f$react$2d$force$2d$graph$2d$3d$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react-force-graph-3d/dist/react-force-graph-3d.mjs [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function KnowledgeEmpireGraph({ nodes, links, onNodeClick }) {
    _s();
    const graphData = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "KnowledgeEmpireGraph.useMemo[graphData]": ()=>{
            const graphNodes = nodes.map({
                "KnowledgeEmpireGraph.useMemo[graphData].graphNodes": (node)=>({
                        ...node,
                        val: Math.max(3, node.sprintCount * 1.8),
                        color: node.color
                    })
            }["KnowledgeEmpireGraph.useMemo[graphData].graphNodes"]);
            const graphLinks = links.map({
                "KnowledgeEmpireGraph.useMemo[graphData].graphLinks": (link)=>({
                        ...link
                    })
            }["KnowledgeEmpireGraph.useMemo[graphData].graphLinks"]);
            return {
                nodes: graphNodes,
                links: graphLinks
            };
        }
    }["KnowledgeEmpireGraph.useMemo[graphData]"], [
        nodes,
        links
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "h-screen w-screen bg-zinc-950",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$force$2d$graph$2d$3d$2f$dist$2f$react$2d$force$2d$graph$2d$3d$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                graphData: graphData,
                backgroundColor: "#09090b",
                nodeLabel: (node)=>{
                    const n = node;
                    return `${n.chapter}
Book: ${n.bookTitle}
Mastery: ${n.masteryStatus}
Sprints: ${n.sprintCount}
Golden Thread: ${n.goldenThread}`;
                },
                nodeColor: (node)=>node.color,
                nodeVal: (node)=>node.val,
                linkColor: ()=>"#3f3f46",
                linkDirectionalParticles: 2,
                linkDirectionalParticleSpeed: 0.004,
                linkDirectionalParticleWidth: 1.3,
                linkDirectionalParticleColor: ()=>"#a1a1aa",
                linkLabel: (link)=>link.label,
                onNodeClick: (node)=>onNodeClick?.(node)
            }, void 0, false, {
                fileName: "[project]/components/knowledge-empire-graph.tsx",
                lineNumber: 36,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pointer-events-none absolute left-6 top-6 max-w-xl rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 text-zinc-100 backdrop-blur",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "text-xl font-semibold tracking-tight",
                        children: "Knowledge Empire"
                    }, void 0, false, {
                        fileName: "[project]/components/knowledge-empire-graph.tsx",
                        lineNumber: 59,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-2 text-sm text-zinc-300",
                        children: "Mastery Graph seeded from your two active books. Node color follows the Traffic Light protocol, node size maps to sprint volume, and links represent shared semantic threads like Efficiency and Scale."
                    }, void 0, false, {
                        fileName: "[project]/components/knowledge-empire-graph.tsx",
                        lineNumber: 60,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/components/knowledge-empire-graph.tsx",
                lineNumber: 58,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/components/knowledge-empire-graph.tsx",
        lineNumber: 35,
        columnNumber: 5
    }, this);
}
_s(KnowledgeEmpireGraph, "kvQIHlg/C1s+v9HX4nbruhDlITo=");
_c = KnowledgeEmpireGraph;
var _c;
__turbopack_context__.k.register(_c, "KnowledgeEmpireGraph");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/components/knowledge-empire-graph.tsx [app-client] (ecmascript, next/dynamic entry)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/components/knowledge-empire-graph.tsx [app-client] (ecmascript)"));
}),
]);

//# sourceMappingURL=components_knowledge-empire-graph_tsx_0cc-7iv._.js.map