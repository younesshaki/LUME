import { render, toPlainText } from "@react-email/render";
import type { EmailTemplate } from "./types";

export type RenderedEmail = { html: string; text: string };
export type EmailTemplateRenderer = <Props extends object>(
  template: EmailTemplate<Props>,
  props: Props,
) => Promise<RenderedEmail>;

export const renderEmailTemplate: EmailTemplateRenderer = async (template, props) => {
  const html = await render(template.render(props));
  return { html, text: toPlainText(html) };
};
