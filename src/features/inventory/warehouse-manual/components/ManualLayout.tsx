export function BorderSection({ id, children }: { id?: string; children: React.ReactNode }){
  return (
    <>
    <div id={id} className="border border-gray-300 rounded-md p-4 flex flex-col gap-1 w-full max-w-2xl scroll-mt-4">
      {children}
    </div>
    <br />
    </>
  )
}

export function InstructionBorder({ children }: { children: React.ReactNode }){
  return(
    <div className="border border-gray-300 bg-gray-100 rounded-md p-4 flex flex-col gap-1 w-full">
      {children}
    </div>
  )
}

export function TitleSection({ children }: { children: React.ReactNode }){
  return (
    <div className="text-xl font-bold text-gray-700">
      {children}
    </div>
  )
}

export function ContentSection({ children }: { children: React.ReactNode }){
  return (

    <> <div className="text-2xl font-bold text-gray-700 text-center">
    {children}
  </div>
  </>
   
  )
}
