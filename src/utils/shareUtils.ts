import { toast } from "sonner";

/**
 * Shares a circle link using the native share sheet or copies it to the clipboard.
 * @param circleId The ID of the circle to share
 * @param circleName The name of the circle to share
 */
export const shareCircle = async (circleId: string, circleName: string) => {
  const shareLink = `${window.location.origin}/circle/${circleId}`;
  const shareData = {
    title: `Join ${circleName} Circle`,
    text: `Check out this circle on Heart Lens Studio: ${circleName}`,
    url: shareLink,
  };

  try {
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(shareLink);
      toast.success("Link copied to clipboard!");
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.error('Error sharing:', error);
      // Fallback to clipboard if share fails for other reasons
      try {
        await navigator.clipboard.writeText(shareLink);
        toast.success("Link copied to clipboard!");
      } catch (clipboardError) {
        toast.error("Failed to share link");
      }
    }
  }
};
