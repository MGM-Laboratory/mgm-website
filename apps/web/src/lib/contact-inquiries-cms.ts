export type CmsContactInquiryRecord = {
  slug: string;
  inquiry: {
    name: string;
    email: string;
    company: string | null;
    message: string;
    attachmentKeys: string[];
    read: boolean;
    readAt: string | null;
    status: "inbox" | "archived";
  };
  createdAt: string;
  updatedAt: string;
};
