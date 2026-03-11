export type ZplExample = {
  id: string;
  title: string;
  command: string;
  description: string;
  zpl: string;
};

export const ZPL_EXAMPLES: ZplExample[] = [
  {
    id: "geometry-pw-ll-lh",
    title: "Label Geometry",
    command: "^PW ^LL ^LH",
    description: "Base label width/length and home origin.",
    zpl: "^XA\n^PW600\n^LL400\n^LH20,20\n^FO0,0^GB560,360,3^FS\n^FO20,20^A0N,34,34^FDGeometry baseline^FS\n^XZ"
  },
  {
    id: "position-lt-ls-fo-ft",
    title: "Position Offsets",
    command: "^LT ^LS ^FO ^FT",
    description: "Top shift, left shift and field origin/baseline differences.",
    zpl: "^XA\n^PW620\n^LL420\n^LT20\n^LS10\n^FO20,20^GB560,340,2^FS\n^FO40,80^A0N,32,32^FD^FO reference^FS\n^FT40,180^A0N,32,32^FD^FT baseline^FS\n^XZ"
  },
  {
    id: "font-cf-a0",
    title: "Font Defaults",
    command: "^CF ^A0",
    description: "Global font defaults and per-field overrides.",
    zpl: "^XA\n^PW620\n^LL420\n^CF0,28,20\n^FO30,30^FDDefault by ^CF^FS\n^FO30,80^A0N,52,38^FDBig ^A0 text^FS\n^FO30,150^A0N,24,24^FDSmall ^A0 text^FS\n^XZ"
  },
  {
    id: "orientation-fw-po",
    title: "Orientation",
    command: "^FW ^PO",
    description: "Field orientation and print orientation impact.",
    zpl: "^XA\n^PW620\n^LL420\n^FWN\n^FO40,40^A0N,30,30^FDNormal^FS\n^FWR\n^FO200,40^A0N,30,30^FDRotated^FS\n^FWN\n^POI\n^FO360,40^A0N,30,30^FDInverted print^FS\n^XZ"
  },
  {
    id: "box-gb-reverse-fr",
    title: "Shapes and Reverse",
    command: "^GB ^FR",
    description: "Lines/boxes and reverse rendering for a field.",
    zpl: "^XA\n^PW620\n^LL420\n^FO30,30^GB560,340,3^FS\n^FO60,70^GB200,120,6^FS\n^FO300,70^GB200,120,0^FS\n^FO70,230^A0N,34,34^FR^FDReverse field^FS\n^XZ"
  },
  {
    id: "field-block-fb",
    title: "Wrapped Text",
    command: "^FB",
    description: "Text wrapping, line spacing and alignment block.",
    zpl: "^XA\n^PW620\n^LL460\n^FO20,20^GB580,420,2^FS\n^FO40,60^A0N,30,24^FB520,4,8,C,0^FDLong text in one field to test wrapping and center alignment. Keep checking line breaks and width clipping.^FS\n^XZ"
  },
  {
    id: "field-hex-fh",
    title: "Hex Escapes",
    command: "^FH",
    description: "Hex sequence decode inside ^FD payload.",
    zpl: "^XA\n^PW620\n^LL260\n^FO30,30^A0N,34,34^FH_^FDHex_20space_2Fslash_3Acolon^FS\n^FO30,100^A0N,28,28^FDNormal text below^FS\n^XZ"
  },
  {
    id: "binding-fn-fv",
    title: "Field Binding",
    command: "^FN ^FV",
    description: "Template fields with assigned values.",
    zpl: "^XA\n^PW620\n^LL340\n^FO30,30^A0N,30,30^FDOrder:^FS\n^FO180,30^FN1^FS\n^FO30,90^A0N,30,30^FDCustomer:^FS\n^FO180,90^FN2^FS\n^FN1^FVORD-2026-00091^FS\n^FN2^FVACME LOGISTICS^FS\n^XZ"
  },
  {
    id: "serial-sn",
    title: "Serial Number",
    command: "^SN",
    description: "Auto-increment serial rendering for field number.",
    zpl: "^XA\n^PW620\n^LL260\n^FO30,30^A0N,30,30^FDSerial:^FS\n^FO170,30^FN1^SN000123,1,6^FS\n^FO30,90^A0N,24,24^FDSame ^FN reused below:^FS\n^FO170,90^FN1^FS\n^XZ"
  },
  {
    id: "barcode-code128-bc",
    title: "Code 128",
    command: "^BY ^BC",
    description: "Main linear barcode with module width and height.",
    zpl: "^XA\n^PW700\n^LL360\n^FO40,30^A0N,28,28^FDCode128 test^FS\n^FO60,80^BY3,2,120^BCN,120,Y,N,N\n^FD5901234123457^FS\n^XZ"
  },
  {
    id: "barcode-ean13-be",
    title: "EAN-13",
    command: "^BE",
    description: "EAN13 barcode with human-readable text.",
    zpl: "^XA\n^PW700\n^LL360\n^FO50,40^A0N,28,28^FDEAN13 sample^FS\n^FO80,90^BY2,2,110^BEN,110,Y,N,N\n^FD590123412345^FS\n^XZ"
  },
  {
    id: "barcode-itf-b2",
    title: "Interleaved 2 of 5",
    command: "^B2",
    description: "Even-length numeric payload for ITF symbol.",
    zpl: "^XA\n^PW700\n^LL360\n^FO50,40^A0N,28,28^FDITF sample^FS\n^FO80,90^BY3,2,110^B2N,110,Y,N,N\n^FD12345678^FS\n^XZ"
  },
  {
    id: "barcode-code39-b3",
    title: "Code 39",
    command: "^B3",
    description: "Alphanumeric Code39 with visible text.",
    zpl: "^XA\n^PW700\n^LL360\n^FO50,40^A0N,28,28^FDCode39 sample^FS\n^FO80,90^BY3,2,110^B3N,N,110,Y,N\n^FDABC-1234^FS\n^XZ"
  },
  {
    id: "barcode-qr-bq",
    title: "QR Code",
    command: "^BQ",
    description: "QR with model and magnification.",
    zpl: "^XA\n^PW620\n^LL420\n^FO40,40^A0N,28,28^FDQR payload^FS\n^FO80,90^BQN,2,6\n^FDLA,https://example.org/track/ABC123^FS\n^XZ"
  },
  {
    id: "barcode-dm-bx",
    title: "DataMatrix",
    command: "^BX",
    description: "ECC200 DataMatrix with module width.",
    zpl: "^XA\n^PW620\n^LL420\n^FO40,40^A0N,28,28^FDDataMatrix payload^FS\n^FO120,100^BXN,6,200\n^FDABC1234567890^FS\n^XZ"
  },
  {
    id: "barcode-pdf417-b7",
    title: "PDF417",
    command: "^B7",
    description: "2D stacked barcode with security/columns/rows.",
    zpl: "^XA\n^PW760\n^LL420\n^FO40,30^A0N,28,28^FDPDF417 sample^FS\n^FO60,90^B7N,4,5,8,6,N\n^FDORDER|ORD-7788|QTY|24|BATCH|A9^FS\n^XZ"
  },
  {
    id: "barcode-maxicode-bd",
    title: "MaxiCode",
    command: "^BD",
    description: "MaxiCode mode check with sample payload.",
    zpl: "^XA\n^PW620\n^LL420\n^FO40,40^A0N,28,28^FDMaxiCode sample^FS\n^FO200,110^BDN,4\n^FD[)>RS01GS9605500000000001GS1Z999AA10102030405EOT^FS\n^XZ"
  },
  {
    id: "graphics-gf",
    title: "Inline Graphic",
    command: "^GF",
    description: "Direct inline bitmap payload rendering.",
    zpl: "^XA\n^PW620\n^LL360\n^FO30,30^A0N,28,28^FDInline ^GF bitmap^FS\n^FO60,90^GFA,128,128,8,FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00^FS\n^XZ"
  },
  {
    id: "graphics-dg-xg",
    title: "Stored Graphic",
    command: "~DG ^XG",
    description: "Download graphic to memory and recall it later.",
    zpl: "^XA\n~DGR:ICON.GRF,128,8,FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00\n^FO30,30^A0N,28,28^FDStored graphic via ^XG^FS\n^FO80,90^XGR:ICON.GRF,1,1^FS\n^XZ"
  },
  {
    id: "mixed-logistics",
    title: "Mixed Logistics Label",
    command: "multiple",
    description: "Combined scenario for regression checks.",
    zpl: "^XA\n^PW760\n^LL520\n^LH20,10\n^FO0,0^GB720,480,3^FS\n^FO20,20^A0N,34,34^FDRegression label^FS\n^FO20,70^A0N,24,24^FDRoute: WRO-POZ-GDN^FS\n^FO20,110^GB680,130,2^FS\n^FO35,130^A0N,24,24^FDSHIP TO:^FS\n^FO35,165^A0N,28,28^FDACME DC 02^FS\n^FO35,200^A0N,22,22^FDBatch 24 / Dock 9^FS\n^FO20,270^BY2,2,110^BCN,110,Y,N,N\n^FD00359012345678901234^FS\n^FO470,260^BQN,2,4\n^FDLA,ORD-7788|PKG-1-3|DOCK-9^FS\n^XZ"
  }
];
