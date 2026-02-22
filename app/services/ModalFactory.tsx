import { create } from "zustand"
import type { ReactNode } from "react"

export type ModalType = "sound-settings" | "name" | "settings" // Extend with more as needed

interface ModalData {
  id: ModalType
  props?: Record<string, any>
}

interface ModalStore {
  activeModal: ModalData | null
  openModal: (id: ModalType, props?: Record<string, any>) => void
  closeModal: () => void
}

export const useModalStore = create<ModalStore>((set) => ({
  activeModal: null,
  openModal: (id, props) => set({ activeModal: { id, props } }),
  closeModal: () => set({ activeModal: null }),
}))

// Registry to map IDs to components
const modalRegistry = new Map<ModalType, (props: any) => ReactNode>()

export const ModalFactory = {
  register: (id: ModalType, component: (props: any) => ReactNode) => {
    modalRegistry.set(id, component)
  },

  // The Container that renders the active modal
  Container: () => {
    const activeModal = useModalStore((state) => state.activeModal)
    const closeModal = useModalStore((state) => state.closeModal)

    if (!activeModal) return null

    const ModalComponent = modalRegistry.get(activeModal.id)

    if (!ModalComponent) {
      console.warn(`No modal registered for id: ${activeModal.id}`)
      return null
    }

    // Wrap in a dialog managed by this logic
    // Actually, we can assume the component itself uses standard Modal layout
    // OR we provide the standard shell here.
    // The previous `Modal` component was a <dialog>.
    // We can reuse `Modal` shell, but let's just render the component.
    // The Component is expected to use the props and render valid JSX.
    // We inject `close` prop.

    return (
      <ModalComponent
        {...activeModal.props}
        isOpen={true}
        onClose={closeModal}
      />
    )
  },
}
