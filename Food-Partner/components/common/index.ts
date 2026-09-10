import type { TextProps } from "@/components/common/atoms/Text";
import type { TextColor } from "@/components/common/atoms/Text";
/* The shared kit. One folder per component under atoms/ molecules/ organisms/
   templates/; this barrel is how screens reach them. */

export type { SheetSpec } from "./utils/sheet";

export { Box } from "./atoms/Box";
export { KeyboardAware } from "./atoms/KeyboardAware";
export { Picture } from "./atoms/Picture";
export { Scroller } from "./atoms/Scroller";
export { Tappable } from "./atoms/Tappable";

/* ── atoms ─────────────────────────────────────────────────────── */
export { Btn } from "./atoms/Btn";
export { Chip } from "./atoms/Chip";
export { Dot } from "./atoms/Dot";
export { ICON_PATHS, Icon } from "./atoms/Icon";
export type { IconName } from "./atoms/Icon";
export { IconBtn } from "./atoms/IconBtn";
export { Rule } from "./atoms/Rule";
export { Text } from "./atoms/Text";
export type { TextColor, TextProps } from "./atoms/Text";
export { Toggle } from "./atoms/Toggle";

export { Refresher } from "./molecules/Refresher";

/* ── molecules ─────────────────────────────────────────────────────── */
export { Block } from "./molecules/Block";
export { Card } from "./molecules/Card";
export { CheckRow } from "./molecules/CheckRow";
export { ChoiceChip } from "./molecules/ChoiceChip";
export { ChoiceChips } from "./molecules/ChoiceChips";
export { DataRow } from "./molecules/DataRow";
export { Field } from "./molecules/Field";
export { Note } from "./molecules/Note";
export { Notice } from "./molecules/Notice";
export { NumberField } from "./molecules/NumberField";
export { Seg } from "./molecules/Seg";
export { StepBars } from "./molecules/StepBars";
export { Stepper } from "./molecules/Stepper";
export { SwitchRow } from "./molecules/SwitchRow";
export { TextField } from "./molecules/TextField";
export { Well } from "./molecules/Well";

/* ── organisms ─────────────────────────────────────────────────────── */
export { ConfirmSheet } from "./organisms/ConfirmSheet";
export { DateField } from "./organisms/DateField";
export { FilePick } from "./organisms/FilePick";
export { ImagePick } from "./organisms/ImagePick";
export { ModalSheet } from "./organisms/ModalSheet";
export { ProductForm, emptyItem } from "./organisms/ProductForm";
export { TimeRange } from "./organisms/TimeRange";
export { HEADER_HEIGHT, TopBar } from "./organisms/TopBar";

/* ── templates ─────────────────────────────────────────────────────── */
export { StepFrame } from "./templates/StepFrame";
export { StepScaffold } from "./templates/StepScaffold";

