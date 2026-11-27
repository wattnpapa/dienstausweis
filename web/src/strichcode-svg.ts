import { RUHEZONE, strichcodeLaeufe } from "../../src/strichcode.js";

const SVG = "http://www.w3.org/2000/svg";

/** Strichcode mit Ruhezone; immer schwarz auf weiß, auch in den dunklen Anzeigemodi. */
export function strichcodeSvg(module: string): SVGSVGElement {
    const breite = module.length + 2 * RUHEZONE;
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", `0 0 ${breite} 10`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("aria-hidden", "true");
    const grund = document.createElementNS(SVG, "rect");
    grund.setAttribute("width", String(breite));
    grund.setAttribute("height", "10");
    grund.setAttribute("fill", "#fff");
    svg.append(grund);
    let x = RUHEZONE;
    let weg = "";
    strichcodeLaeufe(module).forEach((lauf, stelle) => {
        if (stelle % 2 === 0) {
            weg += `M${x} 0h${lauf}v10h-${lauf}z`;
        }
        x += lauf;
    });
    const striche = document.createElementNS(SVG, "path");
    striche.setAttribute("d", weg);
    striche.setAttribute("fill", "#000");
    svg.append(striche);
    return svg;
}
