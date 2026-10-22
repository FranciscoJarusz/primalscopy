# Post de LinkedIn: sitio de Primal Cult

## Versión A: proceso y diseño

El mapa del sitio de Primal Cult se trababa cada vez que hacías zoom, y me llevó un rato entender por qué.

Primal Cult es una colección de 2712 NFTs. El sitio nuevo tiene un soft staking donde cada holder manda sus Primals a entrenar en una de cuatro regiones de un mapa. Quería que ese mapa fuera la pantalla entera, con zoom y arrastre, y que se vieran los Primals de todos paseando por su zona.

Medí con el trace de Chrome y el culpable no era el que sospechaba. No eran los Primals dibujados en canvas ni los desenfoques. Era el SVG del mapa repintándose en cada cuadro. Lo resolví dejando el mapa base como una capa fija que, mientras te movés, solo recibe un transform de CSS, y se repinta bien cuando queda quieta. Los cuadros pasaron de 24-30 ms a unos 12.

Me quedo con eso: medir antes de arreglar, porque mi intuición estaba mal. El sitio lo armé con Astro, React y GSAP, con un backend en Express que lee la cadena.

Si te da curiosidad verlo moverse, está acá: [LINK]

#FrontEnd #UXUI #Astro #React

---

## Versión B: resultado y producto

Poder cambiar precios y reglas del staking sin pedirme un deploy fue la decisión que más tranquilidad le dio al proyecto, y a mí también.

Primal Cult es una colección de 2712 NFTs para [PLACEHOLDER: cliente / rol, por ejemplo "el equipo de Primal Cult"]. Hice el sitio completo. La landing, el Cultomizer, donde cada holder personaliza sus Primals eligiendo variantes de cada trait y actualiza el arte con un clic. El Forge, con rolls pagos. El soft staking con FOG, una página de stats con los holders y un panel de admin.

El admin existe porque las reglas se iban ajustando sobre la marcha: la tasa de FOG por día, los precios de la tienda, los traits. Todo eso quedó editable desde ahí, sin tocar código.

Del lado técnico usé Astro y React, wagmi y viem para conectar la wallet, y un backend en Express. Del lado visual, la tipografía Sunzone y animaciones con GSAP y Lenis para que la landing se sienta viva sin pesar.

Si sos holder, entrá y customizá tu Primal. Y si estás armando algo parecido y querés charlar, escribime. 🙂

[LINK]

#FrontEnd #UXUI #Web3

---

## Versión C: resumen del proyecto

Un mapa con cuatro regiones, donde los Primals de todos los holders pasean a la vez. Esa es la parte del sitio de Primal Cult de la que más ganas tenía de mostrar algo.

Primal Cult es una colección de 2712 NFTs cuyas regalías se usan para quemar $APE. Hice el sitio completo. Tiene una landing con mucho movimiento, el Cultomizer, donde cada holder personaliza sus Primals eligiendo variantes de cada trait y actualiza el arte con un clic, y el Forge, para cambiar traits con rolls. También un soft staking con puntos FOG, que se juega sobre ese mapa, y una página de stats con los holders.

Lo armé con Astro y React, con GSAP y Lenis para las animaciones y wagmi para conectar la wallet. Lo que más me costó fue que el mapa fuera fluido con tantos personajes en pantalla, pero valió la pena.

Si querés verlo, está acá: [LINK]

#FrontEnd #UXUI #Web3
