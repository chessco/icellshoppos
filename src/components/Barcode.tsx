"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

type BarcodeProps = {
  value: string;
  height?: number;
  width?: number;
  displayValue?: boolean;
};

const Barcode = ({ value, height = 46, width = 1.8, displayValue = true }: BarcodeProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    if (!value) {
      svgRef.current.innerHTML = "";
      return;
    }

    JsBarcode(svgRef.current, value, {
      format: "CODE128",
      displayValue,
      margin: 0,
      height,
      fontSize: 17,
      textMargin: 4,
      width,
    });
  }, [value, height, width, displayValue]);

  return <svg ref={svgRef} className="block h-auto w-full" />;
};

export default Barcode;
