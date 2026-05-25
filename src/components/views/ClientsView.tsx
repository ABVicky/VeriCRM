"use client";

import React, { useState } from "react";
import { useStore, ClientStore, WhatsappTemplate } from "@/store/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";

export const ClientsView: React.FC = () => {
  const { user, clients } = useStore();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientStore | null>(null);

  // Edit store states
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientStore | null>(null);
  const [editClientName, setEditClientName] = useState("");
  const [editShopifyDomain, setEditShopifyDomain] = useState("");
  const [editShopifyToken, setEditShopifyToken] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editWhatsappGroupUrl, setEditWhatsappGroupUrl] = useState("");

  // New store form state
  const [newClientName, setNewClientName] = useState("");
  const [newShopifyDomain, setNewShopifyDomain] = useState("");
  const [newShopifyToken, setNewShopifyToken] = useState("");
  const [newLogoUrl, setNewLogoUrl] = useState("");
  const [newWhatsappGroupUrl, setNewWhatsappGroupUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);

  // Template form state
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [editingTemplateIndex, setEditingTemplateIndex] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("English");
  const [templateMessage, setTemplateMessage] = useState("");

  const handleConnectStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName) {
      toast("Please fill in the Brand Name", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch("/api/clients", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newClientName,
          shopifyDomain: newShopifyDomain,
          shopifyAccessToken: newShopifyToken,
          logoUrl: newLogoUrl,
          whatsappGroupUrl: newWhatsappGroupUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to connect Shopify store");
      }

      toast("Shopify store connected and webhooks initialized!", "success");
      setSyncLogs(data.webhooks || []);
      
      // Reset form
      setNewClientName("");
      setNewShopifyDomain("");
      setNewShopifyToken("");
      setNewLogoUrl("");
      setNewWhatsappGroupUrl("");
      setIsCreateOpen(false);
    } catch (error: any) {
      console.error(error);
      toast(error.message || "Failed to register client brand", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditModal = (client: ClientStore) => {
    setEditingClient(client);
    setEditClientName(client.name);
    setEditShopifyDomain(client.shopifyDomain === "CSV_IMPORT_MODE" ? "" : (client.shopifyDomain || ""));
    setEditShopifyToken("");
    setEditLogoUrl(client.logoUrl || "");
    setEditWhatsappGroupUrl(client.whatsappGroupUrl || "");
    setIsEditOpen(true);
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    if (!editClientName) {
      toast("Please fill in the Brand Name", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`/api/clients/${editingClient.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editClientName,
          shopifyDomain: editShopifyDomain || "CSV_IMPORT_MODE",
          shopifyAccessToken: editShopifyToken || undefined,
          logoUrl: editLogoUrl,
          whatsappGroupUrl: editWhatsappGroupUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update client brand");
      }

      toast("Brand settings updated successfully!", "success");
      setIsEditOpen(false);
      setEditingClient(null);
    } catch (error: any) {
      console.error(error);
      toast(error.message || "Failed to update brand", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!editingClient) return;
    if (!window.confirm(`Are you sure you want to delete ${editingClient.name}? This action cannot be undone.`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`/api/clients/${editingClient.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete client brand");
      }

      toast("Brand deleted successfully!", "success");
      setIsEditOpen(false);
      setEditingClient(null);
    } catch (error: any) {
      console.error(error);
      toast(error.message || "Failed to delete brand", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSyncStoreHistory = async (clientId: string) => {
    try {
      toast("Starting historical orders sync...", "info");
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`/api/clients/${clientId}/sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to sync historical orders");
      }

      toast(`Sync complete! Imported ${data.importedCount} new orders.`, "success");
    } catch (error: any) {
      console.error(error);
      toast(error.message || "Historical sync aborted", "error");
    }
  };

  const handleOpenTemplateModal = (client: ClientStore) => {
    setSelectedClient(client);
    setTemplates(client.whatsappTemplates || []);
    setIsTemplateOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!selectedClient) return;

    if (!templateName || !templateMessage) {
      toast("Please fill in template name and content", "warning");
      return;
    }

    const newTemplate: WhatsappTemplate = {
      id: editingTemplateIndex !== null ? templates[editingTemplateIndex]!.id : `tpl_${Date.now()}`,
      name: templateName,
      language: templateLanguage,
      message: templateMessage,
    };

    let updatedTemplates = [...templates];
    if (editingTemplateIndex !== null) {
      updatedTemplates[editingTemplateIndex] = newTemplate;
    } else {
      updatedTemplates.push(newTemplate);
    }

    try {
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`/api/clients/${selectedClient.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          whatsappTemplates: updatedTemplates,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save template to database");
      }

      toast("WhatsApp templates saved successfully!", "success");
      setTemplates(updatedTemplates);
      
      // Reset form
      setTemplateName("");
      setTemplateMessage("");
      setEditingTemplateIndex(null);
    } catch (error) {
      console.error(error);
      toast("Error updating templates", "error");
    }
  };

  const handleEditTemplate = (index: number) => {
    const t = templates[index]!;
    setEditingTemplateIndex(index);
    setTemplateName(t.name);
    setTemplateLanguage(t.language);
    setTemplateMessage(t.message);
  };

  const handleDeleteTemplate = async (index: number) => {
    if (!selectedClient) return;
    const updatedTemplates = templates.filter((_, idx) => idx !== index);

    try {
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`/api/clients/${selectedClient.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          whatsappTemplates: updatedTemplates,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete template");
      }

      toast("Template removed!", "success");
      setTemplates(updatedTemplates);
    } catch (error) {
      console.error(error);
      toast("Failed to remove template", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">Client Brands</h2>
          <p className="text-xs text-muted-foreground">
            Manage your connected Shopify brands, configure active webhook triggers, and write WhatsApp CRM templates.
          </p>
        </div>
        {user?.role === "super_admin" && (
          <Button onClick={() => setIsCreateOpen(true)} className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Connect Store
          </Button>
        )}
      </div>

      {/* Grid of Stores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.map((client) => (
          <div key={client.id} className="glass-panel rounded-xl p-6 border border-border shadow-sm flex flex-col justify-between hover:border-primary/30 transition-all duration-200">
            <div>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-bold text-lg text-primary overflow-hidden flex-shrink-0">
                    {client.logoUrl ? (
                      <img src={client.logoUrl} alt={client.name} className="h-full w-full object-cover" />
                    ) : (
                      client.name.substring(0, 2).toUpperCase()
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground leading-tight">{client.name}</h3>
                    <p className="text-xs text-muted-foreground font-medium">{client.shopifyDomain}</p>
                  </div>
                </div>
                {user?.role === "super_admin" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground flex-shrink-0"
                    onClick={() => handleOpenEditModal(client)}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </Button>
                )}
              </div>

              <div className="space-y-2.5 my-4 pt-3 border-t border-border/60">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Sync webhook status:</span>
                  <Badge variant={client.status === "active" ? "success" : "secondary"}>
                    {client.status === "active" ? "Active (Listening)" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">WhatsApp Templates:</span>
                  <span className="font-bold text-foreground">
                    {client.whatsappTemplates?.length || 0} templates
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t border-border/60 mt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => handleOpenTemplateModal(client)}
              >
                Templates
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => handleSyncStoreHistory(client.id)}
              >
                Sync Orders
              </Button>
            </div>
          </div>
        ))}

        {clients.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground text-sm glass-panel rounded-xl border border-border">
            No brand stores connected yet. Click &quot;Connect Store&quot; above to link a Shopify store.
          </div>
        )}
      </div>

      {/* EDIT STORE MODAL */}
      <Dialog
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingClient(null);
        }}
        title={`Edit Brand: ${editingClient?.name || ""}`}
      >
        <form onSubmit={handleUpdateClient} className="space-y-4">
          <Input
            label="Brand Name"
            placeholder="e.g. Levitate Clothing"
            value={editClientName}
            onChange={(e) => setEditClientName(e.target.value)}
            required
          />
          <Input
            label="Shopify Domain URL (Optional for CSV mode)"
            placeholder="e.g. brand-name.myshopify.com"
            value={editShopifyDomain}
            onChange={(e) => setEditShopifyDomain(e.target.value)}
          />
          <Input
            label="Shopify Admin API Token (Leave blank to keep current)"
            type="password"
            placeholder="shpat_abcdef0123456789"
            value={editShopifyToken}
            onChange={(e) => setEditShopifyToken(e.target.value)}
          />
          <Input
            label="Brand Logo URL (Optional)"
            placeholder="e.g. https://yourdomain.com/logo.png"
            value={editLogoUrl}
            onChange={(e) => setEditLogoUrl(e.target.value)}
          />
          <Input
            label="Fulfillment WhatsApp Group Link (Optional)"
            placeholder="e.g. https://chat.whatsapp.com/G3x..."
            value={editWhatsappGroupUrl}
            onChange={(e) => setEditWhatsappGroupUrl(e.target.value)}
          />

          <div className="pt-4 border-t border-border flex justify-between items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteClient}
              isLoading={isSubmitting}
            >
              Delete Store
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditOpen(false);
                  setEditingClient(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting}>
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* CONNECT STORE MODAL */}
      <Dialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Connect Shopify Store">
        <form onSubmit={handleConnectStore} className="space-y-4">
          <Input
            label="Brand Name"
            placeholder="e.g. Levitate Clothing"
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            required
          />
          <Input
            label="Shopify Domain URL (Optional for CSV mode)"
            placeholder="e.g. brand-name.myshopify.com"
            value={newShopifyDomain}
            onChange={(e) => setNewShopifyDomain(e.target.value)}
          />
          <Input
            label="Shopify Admin API Token (Optional for CSV mode)"
            type="password"
            placeholder="shpat_abcdef0123456789"
            value={newShopifyToken}
            onChange={(e) => setNewShopifyToken(e.target.value)}
          />
          <Input
            label="Brand Logo URL (Optional)"
            placeholder="e.g. https://yourdomain.com/logo.png"
            value={newLogoUrl}
            onChange={(e) => setNewLogoUrl(e.target.value)}
          />
          <Input
            label="Fulfillment WhatsApp Group Link (Optional)"
            placeholder="e.g. https://chat.whatsapp.com/G3x..."
            value={newWhatsappGroupUrl}
            onChange={(e) => setNewWhatsappGroupUrl(e.target.value)}
          />

          <div className="pt-2 border-t border-border flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Connect & Register Webhooks
            </Button>
          </div>
        </form>
      </Dialog>

      {/* WHATSAPP TEMPLATES MODAL */}
      <Dialog
        isOpen={isTemplateOpen}
        onClose={() => {
          setIsTemplateOpen(false);
          setEditingTemplateIndex(null);
          setTemplateName("");
          setTemplateMessage("");
        }}
        title={`WhatsApp Templates: ${selectedClient?.name || ""}`}
      >
        <div className="space-y-6">
          {/* Template Creation / Edit Form */}
          {user?.role === "super_admin" && (
            <div className="bg-secondary/40 p-4 rounded-lg border border-border space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                {editingTemplateIndex !== null ? "Edit Template" : "Add New Template"}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Template Name"
                  placeholder="COD Reminder"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <Select
                  label="Language"
                  options={[
                    { value: "English", label: "English" },
                    { value: "Hindi", label: "Hindi" },
                    { value: "Spanish", label: "Spanish" },
                  ]}
                  value={templateLanguage}
                  onChange={(e) => setTemplateLanguage(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/80 uppercase tracking-wider mb-1.5">
                  Message Content
                </label>
                <textarea
                  className="flex min-h-[100px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Write template message here. Supports placeholders: {{customer_name}}, {{store_name}}, {{order_number}}, {{products}}, {{amount}}, {{currency}}."
                  value={templateMessage}
                  onChange={(e) => setTemplateMessage(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                {editingTemplateIndex !== null && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingTemplateIndex(null);
                      setTemplateName("");
                      setTemplateMessage("");
                    }}
                  >
                    Cancel Edit
                  </Button>
                )}
                <Button type="button" size="sm" onClick={handleSaveTemplate}>
                  Save Template
                </Button>
              </div>
            </div>
          )}

          {/* Templates list */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Configured templates
            </h4>
            {templates.map((tpl, index) => (
              <div key={tpl.id} className="p-4 rounded-lg bg-card border border-border shadow-sm space-y-2 relative group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">{tpl.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {tpl.language}
                    </Badge>
                  </div>
                  {user?.role === "super_admin" && (
                    <div className="flex gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditTemplate(index)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Edit
                      </button>
                      <span className="text-border">|</span>
                      <button
                        onClick={() => handleDeleteTemplate(index)}
                        className="text-xs font-semibold text-destructive hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed bg-secondary/50 p-2.5 rounded border border-border/40 font-mono">
                  {tpl.message}
                </p>
              </div>
            ))}
            {templates.length === 0 && (
              <div className="text-center py-6 text-xs text-muted-foreground">
                No templates configured for this store brand.
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
};
