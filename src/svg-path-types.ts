export interface SvgPoint {
	readonly x: number;
	readonly y: number;
}

export type SvgPathSegment =
	| { readonly kind: "move"; readonly end: SvgPoint }
	| {
			readonly kind: "line" | "close";
			readonly start: SvgPoint;
			readonly end: SvgPoint;
	  }
	| {
			readonly kind: "quadratic";
			readonly start: SvgPoint;
			readonly control: SvgPoint;
			readonly end: SvgPoint;
	  }
	| {
			readonly kind: "cubic";
			readonly start: SvgPoint;
			readonly control1: SvgPoint;
			readonly control2: SvgPoint;
			readonly end: SvgPoint;
	  }
	| {
			readonly kind: "arc";
			readonly start: SvgPoint;
			readonly end: SvgPoint;
			readonly radiusX: number;
			readonly radiusY: number;
			readonly rotation: number;
			readonly largeArc: boolean;
			readonly sweep: boolean;
	  };
