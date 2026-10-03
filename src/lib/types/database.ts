
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "categories": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"name": string,"slug": string,"sort_order": number
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"order_items": {
                  Row: {
                    "created_at": string,"id": string,"order_id": string,"product_id": string | null,"product_image_url": string | null,"product_name": string,"quantity": number,"subtotal_cents": number,"unit_price_cents": number
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"order_id": string,"product_id"?: string | null,"product_image_url"?: string | null,"product_name": string,"quantity": number,"subtotal_cents": number,"unit_price_cents": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"order_id"?: string,"product_id"?: string | null,"product_image_url"?: string | null,"product_name"?: string,"quantity"?: number,"subtotal_cents"?: number,"unit_price_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "confirmation_email_sent_at": string | null,"created_at": string,"currency": string,"customer_email": string,"id": string,"order_number": number,"paid_at": string | null,"payment_status": Database["public"]['Enums']["payment_status"],"status": Database["public"]['Enums']["order_status"],"stripe_checkout_session_id": string | null,"stripe_payment_intent_id": string | null,"subtotal_cents": number,"total_cents": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "confirmation_email_sent_at"?: string | null,"created_at"?: string,"currency"?: string,"customer_email": string,"id"?: string,"order_number"?: never,"paid_at"?: string | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"status"?: Database["public"]['Enums']["order_status"],"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"subtotal_cents": number,"total_cents": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "confirmation_email_sent_at"?: string | null,"created_at"?: string,"currency"?: string,"customer_email"?: string,"id"?: string,"order_number"?: never,"paid_at"?: string | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"status"?: Database["public"]['Enums']["order_status"],"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"subtotal_cents"?: number,"total_cents"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "category_id": string,"created_at": string,"currency": string,"description": string,"id": string,"image_url": string | null,"is_active": boolean,"is_featured": boolean,"name": string,"price_cents": number,"slug": string,"stock_quantity": number,"updated_at": string
                  }
                  Insert: {
                    "category_id": string,"created_at"?: string,"currency"?: string,"description"?: string,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"is_featured"?: boolean,"name": string,"price_cents": number,"slug": string,"stock_quantity"?: number,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"currency"?: string,"description"?: string,"id"?: string,"image_url"?: string | null,"is_active"?: boolean,"is_featured"?: boolean,"name"?: string,"price_cents"?: number,"slug"?: string,"stock_quantity"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string | null,"id": string,"role": Database["public"]['Enums']["user_role"],"updated_at": string,"welcome_email_sent_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string,"welcome_email_sent_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string,"welcome_email_sent_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"webhook_events": {
                  Row: {
                    "id": string,"order_id": string | null,"outcome": string,"processed_at": string,"type": string
                  }
                  Insert: {
                    "id": string,"order_id"?: string | null,"outcome": string,"processed_at"?: string,"type": string
                  }
                  Update: {
                    "id"?: string,"order_id"?: string | null,"outcome"?: string,"processed_at"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "webhook_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "apply_checkout_event":
{ Args: { "p_amount_total": number,"p_currency": string,"p_event_id": string,"p_event_type": string,"p_order_id": string,"p_outcome": string,"p_payment_intent_id": string,"p_session_id": string }; Returns: string
                           },
"create_order":
{ Args: { "p_customer_email": string,"p_items": Json,"p_user_id": string }; Returns: string
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"release_pending_order":
{ Args: { "p_order_id": string }; Returns: boolean
                           }
          }
          Enums: {
            "order_status": "pending"|"paid"|"processing"|"shipped"|"delivered"|"cancelled","payment_status": "pending"|"paid"|"failed"|"refunded","user_role": "customer"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "order_status": ["pending", "paid", "processing", "shipped", "delivered", "cancelled"],"payment_status": ["pending", "paid", "failed", "refunded"],"user_role": ["customer", "admin"]
          }
        }
} as const
