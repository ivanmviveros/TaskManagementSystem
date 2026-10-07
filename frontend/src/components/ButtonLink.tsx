import { createLink, type LinkComponent } from "@tanstack/react-router";
import { forwardRef, type AnchorHTMLAttributes } from "react";

import { buttonClasses, type ButtonSize, type ButtonVariant } from "./buttonClasses";

interface ButtonAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const ButtonAnchor = forwardRef<HTMLAnchorElement, ButtonAnchorProps>(
  ({ variant = "primary", size = "md", className, ...anchor }, ref) => (
    <a
      ref={ref}
      className={buttonClasses(variant, size, `inline-block ${className ?? ""}`)}
      {...anchor}
    />
  ),
);
ButtonAnchor.displayName = "ButtonAnchor";

const RouterButtonLink = createLink(ButtonAnchor);

/**
 * A router link that looks like a Button (D48). ONE element, so ONE Tab stop:
 * wrapping <Button> in <Link> nests a <button> inside an <a> — invalid HTML, and
 * two Tab stops for one control. Takes the router's typed `to`/`params`/`search`.
 */
export const ButtonLink: LinkComponent<typeof ButtonAnchor> = (props) => (
  <RouterButtonLink {...props} />
);
